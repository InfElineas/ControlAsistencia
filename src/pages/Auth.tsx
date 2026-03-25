import { useState } from 'react';
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
import { Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';
import { mapAuthError } from '@/lib/error-messages';

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

  const { signIn, signUp } = useAuth();
  const { departments, loading: deptLoading } = useDepartments();
  const navigate = useNavigate();

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
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(165deg, #163B73 5%, #264F91 55%, #2CAEC2 100%)' }}
    >
      <Card className="w-full max-w-md animate-slide-up rounded-[2rem] border-0 bg-[#F1F4F9]/95 shadow-2xl">
        <CardHeader className="text-center pt-10">
          <div className="flex justify-center mb-5">
            <img
              src="/logo-control-asistencia.svg"
              alt="Control de Asistencia ELINEAS"
              className="h-24 w-24 rounded-2xl bg-black p-2 object-contain shadow-lg"
            />
          </div>
          <CardTitle className="text-[2.1rem] leading-tight text-slate-800">Control de Asistencia ELINEAS</CardTitle>
          <CardDescription className="text-lg text-slate-500 mt-2">
            {isLogin ? 'Inicia sesión para marcar asistencia' : 'Crea tu cuenta'}
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-10">
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Nombre completo</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tu nombre"
                  className="h-14 rounded-2xl border-slate-200 bg-white/80 px-4 text-lg placeholder:text-slate-400"
                  required={!isLogin}
                />
              </div>
            )}

            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej: 5512345678"
                  className="h-14 rounded-2xl border-slate-200 bg-white/80 px-4 text-lg placeholder:text-slate-400"
                  required={!isLogin}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700 text-[1.1rem]">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="h-14 rounded-2xl border-slate-200 bg-white/80 px-4 text-lg placeholder:text-slate-400"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 text-[1.1rem]">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="h-14 rounded-2xl border-slate-200 bg-white/80 px-4 pr-12 text-lg placeholder:text-slate-400"
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
              <div className="space-y-2">
                <Label htmlFor="department">Departamento</Label>
                {deptLoading ? (
                  <div className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
                    Cargando departamentos...
                  </div>
                ) : (
                  <Select value={departmentId} onValueChange={setDepartmentId}>
                    <SelectTrigger id="department" className="h-14 rounded-2xl border-slate-200 bg-white/80 px-4 text-base">
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
              className="w-full h-14 rounded-2xl bg-[#1D3F75] text-2xl font-semibold hover:bg-[#183664]"
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

          <div className="mt-8 text-center text-[1.1rem]">
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
