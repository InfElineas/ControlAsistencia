import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { resolveAuthRedirectUrl } from '@/lib/auth-redirect';

function resolveEmailRedirectUrl(): string {
  const configuredUrl = import.meta.env.VITE_PUBLIC_APP_URL?.trim();

  if (configuredUrl) {
    try {
      const parsedUrl = new URL(configuredUrl);
      return `${parsedUrl.origin}/`;
    } catch {
      console.warn('VITE_PUBLIC_APP_URL no es una URL válida. Se usará el origen actual.');
    }
  }

  return `${window.location.origin}/`;
}

export type AppRole = 'employee' | 'department_head' | 'global_manager';

interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  department_id: string;
  phone: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, departmentId: string, phone: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (input: {
    full_name: string;
    phone: string;
    department_id: string;
    email: string;
  }) => Promise<{ error: string | null; emailConfirmationRequired?: boolean }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer profile fetch with setTimeout to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchUserProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRole(null);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (userId: string) => {
    try {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData as UserProfile);

      // Fetch role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      if (roleError) throw roleError;
      setRole(roleData.role as AppRole);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string, departmentId: string, phone: string) => {
    const redirectUrl = resolveAuthRedirectUrl(window.location.origin);

    if (!redirectUrl) {
      return {
        error: new Error('No se pudo determinar la URL de confirmación. Configura VITE_PUBLIC_APP_URL con tu dominio público.'),
      };
    }
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          department_id: departmentId,
          phone,
        },
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
  };

  const updateProfile = async (input: {
    full_name: string;
    phone: string;
    department_id: string;
    email: string;
  }) => {
    if (!user) {
      return { error: 'Usuario no autenticado' };
    }

    try {
      let emailConfirmationRequired = false;

      if (input.email !== user.email) {
        const { error: authError } = await supabase.auth.updateUser({ email: input.email });
        if (authError) {
          return { error: authError.message };
        }
        emailConfirmationRequired = true;
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: input.full_name,
          phone: input.phone,
          department_id: input.department_id,
          email: input.email,
        })
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (error) {
        return { error: error.message };
      }

      setProfile(data as UserProfile);
      return { error: null, emailConfirmationRequired };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return { error: error.message };
      }
      return { error: 'No fue posible actualizar el perfil' };
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      role,
      loading,
      signIn,
      signUp,
      signOut,
      updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
