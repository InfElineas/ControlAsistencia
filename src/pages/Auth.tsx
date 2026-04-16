import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDepartments } from '@/hooks/useDepartments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, Eye, EyeOff, User, Phone, Mail, Lock, Building2 } from 'lucide-react';
import { z } from 'zod';
import { mapAuthError } from '@/lib/error-messages';
import { isNativeRuntime } from '@/lib/mobile-runtime';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
});

const signupSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  fullName: z.string().min(2, 'Nombre requerido'),
  phone: z.string().min(8, 'Teléfono requerido (mínimo 8 dígitos)'),
  departmentId: z.string().min(1, 'Selecciona un departamento'),
});

export default function Auth() {
  const nativeRuntime = isNativeRuntime();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberCredentials, setRememberCredentials] = useState(nativeRuntime);

  const { signIn, signUp } = useAuth();
  const { departments, loading: deptLoading } = useDepartments();
  const navigate = useNavigate();
  const fieldClassName = 'h-11 rounded-2xl border-slate-200 bg-white/80 px-4 text-base placeholder:text-slate-400';

  useEffect(() => {
    if (!nativeRuntime) return;

    const storedEmail = window.localStorage.getItem('native-login-email');
    const storedPassword = window.localStorage.getItem('native-login-password');

    if (storedEmail) {
      setEmail(storedEmail);
    }

    if (storedPassword) {
      setPassword(storedPassword);
    }
  }, [nativeRuntime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) {
      return;
    }
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      if (isLogin) {
        const normalizedEmail = email.trim().toLowerCase();
        const result = loginSchema.safeParse({ email: normalizedEmail, password });
        if (!result.success) {
          setError(result.error.errors[0].message);
          setLoading(false);
          return;
        }

        const { error } = await signIn(normalizedEmail, password);
        if (error) {
          setError(mapAuthError(error, 'signin'));
          setLoading(false);
          return;
        }

        if (nativeRuntime && rememberCredentials) {
          window.localStorage.setItem('native-login-email', normalizedEmail);
          window.localStorage.setItem('native-login-password', password);
        } else if (nativeRuntime) {
          window.localStorage.removeItem('native-login-email');
          window.localStorage.removeItem('native-login-password');
        }
      } else {
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedFullName = fullName.trim();
        const normalizedPhone = phone.trim();
        const result = signupSchema.safeParse({ email: normalizedEmail, password, fullName: normalizedFullName, phone: normalizedPhone, departmentId });
        if (!result.success) {
          setError(result.error.errors[0].message);
          setLoading(false);
          return;
        }

        const { error } = await signUp(normalizedEmail, password, normalizedFullName, departmentId, normalizedPhone);
        if (error) {
          setError(mapAuthError(error, 'signup'));
          setLoading(false);
          return;
        }

        setIsLogin(true);
        setPassword('');
        setSuccessMessage('Registro exitoso. Ya puedes iniciar sesión con tu correo y contraseña.');
        setLoading(false);
        return;
      }

      navigate('/');
    } catch (err: unknown) {
      setError(mapAuthError(err, isLogin ? 'signin' : 'signup'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative h-[100dvh] flex items-center justify-center overflow-hidden p-3 sm:p-4">
      <div className="absolute inset-0 bg-gradient-to-b from-[#173B72] via-[#2A59A1] to-[#61B5E4]" />
      <div className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: 'radial-gradient(circle at 20% 85%, rgba(255,255,255,0.5) 1px, transparent 2px), radial-gradient(circle at 80% 75%, rgba(255,255,255,0.45) 1px, transparent 2px)', backgroundSize: '28px 28px' }} />
      <Card className="relative z-10 w-full max-w-[500px] animate-slide-up rounded-[2.1rem] border border-white/20 bg-gradient-to-b from-[#f4f6fd]/95 via-[#f5f8ff]/95 to-[#eff3ff]/95 shadow-[0_20px_60px_rgba(18,56,125,0.45)]">
        <CardHeader className="text-center pt-6 pb-2">
          <div className="flex justify-center mb-3">
            <img
              src="/logo-control-asistencia.svg"
              alt="Control de Asistencia ELINEAS"
              className="h-20 w-20 rounded-2xl bg-black p-2 object-contain shadow-lg"
            />
          </div>
          <CardTitle className="text-[clamp(1.8rem,4.5vw,2.6rem)] leading-tight text-slate-800">Control de Asistencia ELINEAS</CardTitle>
          <CardDescription className="text-[clamp(1rem,2.2vw,1.35rem)] text-slate-500 mt-1">
            {isLogin ? 'Inicia sesión para marcar asistencia' : 'Crea tu cuenta'}
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {!isLogin && (
              <div className="space-y-1.5">
                <Label htmlFor="fullName" className="inline-flex items-center gap-2 text-slate-700 text-[1rem]">
                  <User className="h-4 w-4 text-[#2C5CA8]" />
                  Nombre completo
                </Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tu nombre"
                  className={fieldClassName}
                  required={!isLogin}
                />
              </div>
            )}

            {!isLogin && (
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="inline-flex items-center gap-2 text-slate-700 text-[1rem]">
                  <Phone className="h-4 w-4 text-[#2C5CA8]" />
                  Teléfono
                </Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej: 5512345678"
                  className={fieldClassName}
                  required={!isLogin}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="inline-flex items-center gap-2 text-slate-700 text-[1rem]">
                <Mail className="h-4 w-4 text-[#2C5CA8]" />
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className={fieldClassName}
                required
              />
            </div>

            {isLogin && nativeRuntime && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberCredentials}
                  onChange={(e) => setRememberCredentials(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#1D3F75] focus:ring-[#1D3F75]"
                />
                Recordar usuario y contraseña en este dispositivo
              </label>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="password" className="inline-flex items-center gap-2 text-slate-700 text-[1rem]">
                <Lock className="h-4 w-4 text-[#2C5CA8]" />
                Contraseña
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className={`${fieldClassName} pr-12`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {!isLogin && (
              <div className="space-y-1.5">
                <Label htmlFor="department" className="inline-flex items-center gap-2 text-slate-700 text-[1rem]">
                  <Building2 className="h-4 w-4 text-[#2C5CA8]" />
                  Departamento
                </Label>
                {deptLoading ? (
                  <div className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
                    Cargando departamentos...
                  </div>
                ) : (
                  <Select value={departmentId} onValueChange={setDepartmentId}>
                    <SelectTrigger id="department" className={fieldClassName}>
                      <SelectValue placeholder="Selecciona departamento" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 rounded-lg bg-success/10 text-success text-sm">
                {successMessage}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 rounded-2xl bg-[#1D3F75] text-xl font-semibold hover:bg-[#183664]"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isLogin ? 'Iniciando...' : 'Registrando...'}
                </>
              ) : (
                isLogin ? 'Iniciar sesión' : 'Crear cuenta'
              )}
            </Button>
          </form>

          <div className="mt-4 text-center text-[1.05rem]">
            <span className="text-slate-500">
              {isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
            </span>{' '}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setSuccessMessage('');
              }}
              className="text-[#1D3F75] font-semibold hover:underline"
            >
              {isLogin ? 'Regístrate' : 'Inicia sesión'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
