import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type MlTaskName =
  | "attrition"
  | "workforce_forecast"
  | "candidate_match"
  | "payroll_anomalies"
  | "attendance_anomalies"
  | "skills_gap"
  | "sentiment"
  | "performance_trends";

function resolveMlEnginePaths(): { pythonExe: string; cliPath: string } | null {
  const roots = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
  ];

  for (const root of roots) {
    const mlDir = path.join(root, "services", "ml-engine");
    const cliPath = path.join(mlDir, "cli.py");
    if (!fs.existsSync(cliPath)) continue;

    const candidates = [
      path.join(mlDir, ".venv", "Scripts", "python.exe"),
      path.join(mlDir, ".venv", "bin", "python"),
      process.env.PEOPLEOS_PYTHON_PATH || "",
    ].filter(Boolean);

    for (const exe of candidates) {
      if (fs.existsSync(exe)) {
        return { pythonExe: exe, cliPath };
      }
    }
    return { pythonExe: "python", cliPath };
  }
  return null;
}

export async function runPythonMlTask<T = Record<string, unknown>>(
  task: MlTaskName,
  payload: Record<string, unknown>,
): Promise<T> {
  // 1. Prefer dedicated HTTP Python ML microservice when ML_SERVICE_URL is configured
  const serviceUrl = process.env.ML_SERVICE_URL;
  if (serviceUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/predict/${task}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`ML microservice returned HTTP ${response.status}`);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  // 2. Execute local Python 3.14 ML engine subprocess directly inside workspace venv
  const paths = resolveMlEnginePaths();
  if (!paths) {
    throw new Error("Python ML engine directory not found in workspace.");
  }

  return new Promise<T>((resolve, reject) => {
    const child = spawn(paths.pythonExe, [paths.cliPath], {
      cwd: path.dirname(paths.cliPath),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`ML task '${task}' timed out after 15s`));
    }, 15_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr || stdout || `ML engine exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as T);
      } catch (parseErr) {
        reject(
          new Error(
            `Invalid JSON from ML engine: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
          ),
        );
      }
    });

    child.stdin.write(JSON.stringify({ task, payload }));
    child.stdin.end();
  });
}

