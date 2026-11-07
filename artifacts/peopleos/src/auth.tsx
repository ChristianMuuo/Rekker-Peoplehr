import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { ClerkProvider as RealClerkProvider, useClerk as useRealClerk, useUser as useRealUser, Show as RealShow, SignIn as RealSignIn, SignUp as RealSignUp } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ShieldCheck, UserCheck, ArrowRight, Lock, Sparkles } from 'lucide-react';

export const rawClerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
export const hasValidClerkKey = Boolean(
  rawClerkKey &&
  rawClerkKey.startsWith('pk_') &&
  !rawClerkKey.includes('localhost')
);

// Demo User Type
export interface MockUser {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  primaryEmailAddress: { emailAddress: string };
  imageUrl: string;
  role: string;
  department: string;
}

export const DEMO_USERS: Record<string, MockUser> = {
  admin: {
    id: 'user_demo_admin_01',
    fullName: 'David Kibet',
    firstName: 'David',
    lastName: 'Kibet',
    primaryEmailAddress: { emailAddress: 'david.kibet@rekker.co.ke' },
    imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    role: 'hr_admin',
    department: 'People & Culture',
  },
  manager: {
    id: 'user_demo_manager_01',
    fullName: 'Achieng Odhiambo',
    firstName: 'Achieng',
    lastName: 'Odhiambo',
    primaryEmailAddress: { emailAddress: 'achieng.odhiambo@rekker.co.ke' },
    imageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80',
    role: 'hr_manager',
    department: 'Manufacturing',
  },
  employee: {
    id: 'user_demo_employee_01',
    fullName: 'Mwangi Kariuki',
    firstName: 'Mwangi',
    lastName: 'Kariuki',
    primaryEmailAddress: { emailAddress: 'mwangi.kariuki@rekker.co.ke' },
    imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    role: 'employee',
    department: 'Distribution',
  },
};

interface DemoAuthContextType {
  isSignedIn: boolean;
  user: MockUser | null;
  signInAs: (roleKey: keyof typeof DEMO_USERS) => void;
  signOut: () => void;
}

const DemoAuthContext = createContext<DemoAuthContextType>({
  isSignedIn: true,
  user: DEMO_USERS.admin,
  signInAs: () => {},
  signOut: () => {},
});

const DEMO_STORAGE_KEY = 'rekker_peopleos_auth_user';

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [activeKey, setActiveKey] = useState<string>(() => {
    try {
      return localStorage.getItem(DEMO_STORAGE_KEY) || 'admin';
    } catch {
      return 'admin';
    }
  });

  const [isSignedIn, setIsSignedIn] = useState<boolean>(() => {
    return activeKey !== 'signed_out';
  });

  const currentUser = activeKey !== 'signed_out' ? (DEMO_USERS[activeKey] || DEMO_USERS.admin) : null;

  const signInAs = (roleKey: keyof typeof DEMO_USERS) => {
    setActiveKey(roleKey);
    setIsSignedIn(true);
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, roleKey);
    } catch {}
  };

  const signOut = () => {
    setActiveKey('signed_out');
    setIsSignedIn(false);
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, 'signed_out');
    } catch {}
  };

  return (
    <DemoAuthContext.Provider value={{ isSignedIn, user: currentUser, signInAs, signOut }}>
      {children}
    </DemoAuthContext.Provider>
  );
}

// Unified Hooks
export function useUser() {
  if (hasValidClerkKey) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRealUser();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ctx = useContext(DemoAuthContext);
  return {
    isLoaded: true,
    isSignedIn: ctx.isSignedIn,
    user: ctx.user,
  };
}

export function useClerk() {
  if (hasValidClerkKey) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useRealClerk();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ctx = useContext(DemoAuthContext);
  return {
    signOut: (opts?: { redirectUrl?: string }) => {
      ctx.signOut();
      if (opts?.redirectUrl) {
        window.location.href = opts.redirectUrl;
      }
    },
    openSignIn: () => {},
    addListener: (_listener: (e: { user: MockUser | null }) => void) => {
      return () => {};
    },
  };
}

export function Show({ when, children }: { when: 'signed-in' | 'signed-out'; children: ReactNode }) {
  if (hasValidClerkKey) {
    return <RealShow when={when}>{children}</RealShow>;
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { isSignedIn } = useUser();
  if (when === 'signed-in' && isSignedIn) return <>{children}</>;
  if (when === 'signed-out' && !isSignedIn) return <>{children}</>;
  return null;
}

export function SignIn({ routing, path, signUpUrl }: { routing?: string; path?: string; signUpUrl?: string }) {
  if (hasValidClerkKey) {
    return <RealSignIn routing={routing as any} path={path} signUpUrl={signUpUrl} />;
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ctx = useContext(DemoAuthContext);

  return (
    <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-xl">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-700">
          <ShieldCheck size={26} />
        </div>
        <h2 className="font-display text-2xl font-bold text-stone-900">Sign in to Rekker PeopleOS</h2>
        <p className="mt-1 text-xs text-stone-500">Select an enterprise role to enter your workspace</p>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => {
            ctx.signInAs('admin');
            window.location.href = '/overview';
          }}
          className="flex w-full items-center justify-between rounded-xl border-2 border-red-700/20 bg-red-50/50 p-3.5 text-left transition hover:border-red-700 hover:bg-red-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-700 font-bold text-white text-xs">
              DK
            </div>
            <div>
              <p className="text-sm font-bold text-stone-900">David Kibet <span className="ml-1 text-[10px] rounded bg-red-100 text-red-800 px-1.5 py-0.5">Admin</span></p>
              <p className="text-xs text-stone-500">david.kibet@rekker.co.ke · Full Privileges</p>
            </div>
          </div>
          <ArrowRight size={17} className="text-red-700" />
        </button>

        <button
          onClick={() => {
            ctx.signInAs('manager');
            window.location.href = '/overview';
          }}
          className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white p-3.5 text-left transition hover:border-stone-400 hover:bg-stone-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-700 font-bold text-white text-xs">
              AO
            </div>
            <div>
              <p className="text-sm font-bold text-stone-900">Achieng Odhiambo <span className="ml-1 text-[10px] rounded bg-stone-100 text-stone-700 px-1.5 py-0.5">HR Manager</span></p>
              <p className="text-xs text-stone-500">Manufacturing Division Manager</p>
            </div>
          </div>
          <ArrowRight size={17} className="text-stone-400" />
        </button>

        <button
          onClick={() => {
            ctx.signInAs('employee');
            window.location.href = '/overview';
          }}
          className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white p-3.5 text-left transition hover:border-stone-400 hover:bg-stone-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-600 font-bold text-white text-xs">
              MK
            </div>
            <div>
              <p className="text-sm font-bold text-stone-900">Mwangi Kariuki <span className="ml-1 text-[10px] rounded bg-stone-100 text-stone-700 px-1.5 py-0.5">Employee</span></p>
              <p className="text-xs text-stone-500">Distribution Logistics Specialist</p>
            </div>
          </div>
          <ArrowRight size={17} className="text-stone-400" />
        </button>
      </div>

      <div className="mt-6 border-t border-stone-100 pt-4 text-center">
        <p className="text-[11px] text-stone-400 flex items-center justify-center gap-1.5">
          <Lock size={12} /> Enterprise SSO & Kenya Data Protection Act 2019 Compliant
        </p>
      </div>
    </div>
  );
}

export function SignUp({ routing, path, signInUrl }: { routing?: string; path?: string; signInUrl?: string }) {
  if (hasValidClerkKey) {
    return <RealSignUp routing={routing as any} path={path} signInUrl={signInUrl} />;
  }
  return <SignIn routing={routing} path={path} signUpUrl={signInUrl} />;
}

export function UnifiedAuthProvider({
  children,
  clerkPubKey,
  appearance,
  basePath,
  routerPush,
  routerReplace,
}: {
  children: ReactNode;
  clerkPubKey?: string;
  appearance?: any;
  basePath: string;
  routerPush: (to: string) => void;
  routerReplace: (to: string) => void;
}) {
  if (hasValidClerkKey && clerkPubKey) {
    return (
      <RealClerkProvider
        publishableKey={clerkPubKey}
        appearance={appearance}
        signInUrl={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        routerPush={routerPush}
        routerReplace={routerReplace}
      >
        {children}
      </RealClerkProvider>
    );
  }

  return <DemoAuthProvider>{children}</DemoAuthProvider>;
}

