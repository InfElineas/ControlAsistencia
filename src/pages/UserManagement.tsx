import { useState, useEffect, useCallback, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth, AppRole } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { mapUserManagementError } from '@/lib/error-messages';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useDepartments } from '@/hooks/useDepartments';
import { Loader2, UserPlus, Shield, Users, Edit, Filter, Trash2, UserX, RotateCcw } from 'lucide-react';
import { z } from 'zod';
import { Checkbox } from '@/components/ui/checkbox';
import { getHighestRole } from '@/lib/roles';
import { formatLastConnection } from '@/lib/last-connection';

interface FunctionErrorPayload {
  error?: string;
  message?: string;
}

function hasFunctionContext(error: unknown): error is { context: Response } {
  return typeof error === 'object' && error !== null && 'context' in error;
}

async function resolveFunctionErrorMessage(error: unknown): Promise<string | null> {
  if (!hasFunctionContext(error)) return null;

  try {
    const payload = (await error.context.clone().json()) as FunctionErrorPayload;
    return payload.error || payload.message || null;
  } catch {
    return null;
  }
}

async function getFreshAccessToken(): Promise<string | null> {
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (!refreshError && refreshed.session?.access_token) {
    return refreshed.session.access_token;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData.session?.access_token ?? null;
}

interface UserWithRole {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  department_id: string;
  department_name?: string;
  role: AppRole;
  managed_department_ids: string[];
  managed_department_names: string[];
  last_connection_at: string | null;
  is_active: boolean;
  deactivation_reason: string | null;
  contract_cancelled_at: string | null;
  deactivated_at: string | null;
}

const USERS_PAGE_SIZE = 10;

const createUserSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  full_name: z.string().min(2, 'Nombre requerido'),
  department_id: z.string().min(1, 'Selecciona un departamento'),
  role: z.enum(['employee', 'department_head', 'global_manager', 'superadmin']),
});

export default function UserManagement() {
  const { role, user: currentUser } = useAuth();
  const canDeleteUsers = role === 'superadmin';
  const { toast } = useToast();
  const { departments } = useDepartments();
  
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole>('employee');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedManagedDepartments, setSelectedManagedDepartments] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Filters
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<'active' | 'inactive' | 'all'>('active');
  
  const filteredUsers = users.filter(user => {
    const matchesDepartment = filterDepartment === 'all' || user.department_id === filterDepartment;
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'active' ? user.is_active : !user.is_active);
    return matchesDepartment && matchesRole && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PAGE_SIZE));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * USERS_PAGE_SIZE;
    return filteredUsers.slice(start, start + USERS_PAGE_SIZE);
  }, [currentPage, filteredUsers]);
  
  // Create user state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserDepartment, setNewUserDepartment] = useState('');
  const [newUserRole, setNewUserRole] = useState<AppRole>('employee');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [deletingUser, setDeletingUser] = useState<UserWithRole | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deactivatingUser, setDeactivatingUser] = useState<UserWithRole | null>(null);
  const [deactivationReason, setDeactivationReason] = useState('');
  const [contractCancelledAt, setContractCancelledAt] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      const { data: managedDepartmentsData, error: managedDepartmentsError } = await supabase
        .from('user_department_responsibilities')
        .select('user_id, department_id');

      if (managedDepartmentsError) throw managedDepartmentsError;

      const rolesByUser = (roles ?? []).reduce<Record<string, string[]>>((acc, row) => {
        if (!acc[row.user_id]) {
          acc[row.user_id] = [];
        }
        acc[row.user_id].push(row.role);
        return acc;
      }, {});

      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => {
        const dept = departments.find(d => d.id === profile.department_id);
        const roleForUser = getHighestRole(rolesByUser[profile.user_id] ?? []);
        const extraDepartmentIds = (managedDepartmentsData || [])
          .filter((row) => row.user_id === profile.user_id)
          .map((row) => row.department_id)
          .filter((departmentId) => departmentId !== profile.department_id);

        const managedDepartmentIds = Array.from(new Set([profile.department_id, ...extraDepartmentIds]));
        const managedDepartmentNames = managedDepartmentIds
          .map((departmentId) => departments.find((department) => department.id === departmentId)?.name)
          .filter((name): name is string => Boolean(name));

        return {
          id: profile.id,
          user_id: profile.user_id,
          email: profile.email,
          full_name: profile.full_name,
          department_id: profile.department_id,
          department_name: dept?.name || 'Sin departamento',
          role: roleForUser as AppRole,
          managed_department_ids: managedDepartmentIds,
          managed_department_names: managedDepartmentNames,
          last_connection_at: profile.last_connection_at,
          is_active: profile.is_active ?? true,
          deactivation_reason: profile.deactivation_reason ?? null,
          contract_cancelled_at: profile.contract_cancelled_at ?? null,
          deactivated_at: profile.deactivated_at ?? null,
        };
      });

      setUsers(usersWithRoles);
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: mapUserManagementError(error, 'fetch'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [departments, toast]);

  useEffect(() => {
    if (departments.length > 0) {
      fetchUsers();
    }
  }, [departments, fetchUsers]);


  useEffect(() => {
    setCurrentPage(1);
  }, [filterDepartment, filterRole]);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);


  const handleEditUser = (user: UserWithRole) => {
    setEditingUser(user);
    setSelectedRole(user.role);
    setSelectedDepartment(user.department_id);
    setSelectedManagedDepartments(user.managed_department_ids);
    setDialogOpen(true);
  };


  const toggleManagedDepartment = (departmentId: string, checked: boolean) => {
    setSelectedManagedDepartments((current) => {
      if (checked) {
        return Array.from(new Set([...current, departmentId]));
      }
      return current.filter((item) => item !== departmentId);
    });
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;

    try {
      setSaving(true);

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ department_id: selectedDepartment })
        .eq('user_id', editingUser.user_id);

      if (profileError) throw profileError;

      const { error: deleteRolesError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', editingUser.user_id);

      if (deleteRolesError) throw deleteRolesError;

      const { error: insertError } = await supabase
        .from('user_roles')
        .insert({ user_id: editingUser.user_id, role: selectedRole });

      if (insertError) throw insertError;

      const { error: deleteResponsibilitiesError } = await supabase
        .from('user_department_responsibilities')
        .delete()
        .eq('user_id', editingUser.user_id);

      if (deleteResponsibilitiesError) throw deleteResponsibilitiesError;

      if (selectedRole === 'department_head') {
        const extraDepartments = selectedManagedDepartments.filter(
          (departmentId) => departmentId !== selectedDepartment
        );

        if (extraDepartments.length > 0) {
          const { error: insertResponsibilitiesError } = await supabase
            .from('user_department_responsibilities')
            .insert(
              extraDepartments.map((departmentId) => ({
                user_id: editingUser.user_id,
                department_id: departmentId,
                created_by: currentUser?.id ?? null,
              }))
            );

          if (insertResponsibilitiesError) throw insertResponsibilitiesError;
        }
      }

      await supabase.from('audit_log').insert({
        user_id: currentUser?.id ?? null,
        action: 'role_changed',
        description: `Rol actualizado para ${editingUser.email}`,
        metadata: { actor_role: role ?? 'unknown' },
        table_name: 'user_roles',
        record_id: editingUser.user_id,
        old_data: { role: editingUser.role, department_id: editingUser.department_id, managed_department_ids: editingUser.managed_department_ids },
        new_data: { role: selectedRole, department_id: selectedDepartment, managed_department_ids: selectedManagedDepartments },
      });

      toast({
        title: 'Usuario actualizado',
        description: `El usuario ${editingUser.full_name} ha sido actualizado correctamente.`,
      });

      setDialogOpen(false);
      setEditingUser(null);
      fetchUsers();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: mapUserManagementError(error, 'update'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateUser = async () => {
    setCreateError('');
    
    const validation = createUserSchema.safeParse({
      email: newUserEmail,
      password: newUserPassword,
      full_name: newUserName,
      department_id: newUserDepartment,
      role: newUserRole,
    });

    if (!validation.success) {
      setCreateError(validation.error.errors[0].message);
      return;
    }

    try {
      setCreating(true);

      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: newUserEmail,
          password: newUserPassword,
          full_name: newUserName,
          department_id: newUserDepartment,
          role: newUserRole,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'Usuario creado',
        description: `El usuario ${newUserName} ha sido creado correctamente.`,
      });

      // Reset form
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserName('');
      setNewUserDepartment('');
      setNewUserRole('employee');
      setCreateDialogOpen(false);
      fetchUsers();
    } catch (error: unknown) {
      setCreateError(mapUserManagementError(error, 'create'));
    } finally {
      setCreating(false);
    }
  };


  const handleOpenDeleteDialog = (targetUser: UserWithRole) => {
    setDeletingUser(targetUser);
    setDeleteDialogOpen(true);
  };

  const handleOpenDeactivateDialog = (targetUser: UserWithRole) => {
    setDeactivatingUser(targetUser);
    setDeactivationReason('');
    setContractCancelledAt('');
    setDeactivateDialogOpen(true);
  };

  const handleDeactivateUser = async () => {
    if (!deactivatingUser) return;
    if (!deactivationReason.trim()) {
      toast({ title: 'Motivo requerido', description: 'Debes indicar el motivo de baja del trabajador.', variant: 'destructive' });
      return;
    }
    if (!contractCancelledAt) {
      toast({ title: 'Fecha requerida', description: 'Debes indicar la fecha de cancelación de contrato.', variant: 'destructive' });
      return;
    }

    try {
      setDeactivating(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          is_active: false,
          deactivation_reason: deactivationReason.trim(),
          contract_cancelled_at: contractCancelledAt,
          deactivated_at: new Date().toISOString(),
          deactivated_by: currentUser?.id ?? null,
        })
        .eq('user_id', deactivatingUser.user_id);

      if (error) throw error;

      toast({
        title: 'Trabajador dado de baja',
        description: `${deactivatingUser.full_name} fue movido a la papelera de reciclaje.`,
      });

      setDeactivateDialogOpen(false);
      setDeactivatingUser(null);
      fetchUsers();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: mapUserManagementError(error, 'update'),
        variant: 'destructive',
      });
    } finally {
      setDeactivating(false);
    }
  };

  const handleRestoreUser = async (targetUser: UserWithRole) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          is_active: true,
          deactivation_reason: null,
          contract_cancelled_at: null,
          deactivated_at: null,
          deactivated_by: null,
        })
        .eq('user_id', targetUser.user_id);

      if (error) throw error;

      toast({
        title: 'Usuario restaurado',
        description: `${targetUser.full_name} vuelve a estar activo.`,
      });
      fetchUsers();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: mapUserManagementError(error, 'update'),
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser || !canDeleteUsers) {
      return;
    }

    try {
      setDeleting(true);

      const accessToken = await getFreshAccessToken();

      if (!accessToken) {
        throw new Error('Tu sesión expiró. Inicia sesión nuevamente para eliminar usuarios.');
      }

      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { user_id: deletingUser.user_id },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error && String(error.message || '').toLowerCase().includes('unauthorized')) {
        const retryToken = await getFreshAccessToken();
        if (!retryToken) throw error;

        const retryResult = await supabase.functions.invoke('delete-user', {
          body: { user_id: deletingUser.user_id },
          headers: { Authorization: `Bearer ${retryToken}` },
        });

        if (retryResult.error) throw retryResult.error;
        if (retryResult.data?.error) throw new Error(retryResult.data.error);

        toast({
          title: 'Usuario eliminado',
          description: `El usuario ${deletingUser.full_name} fue eliminado correctamente.`,
        });

        setDeleteDialogOpen(false);
        setDeletingUser(null);
        fetchUsers();
        return;
      }

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'Usuario eliminado',
        description: `El usuario ${deletingUser.full_name} fue eliminado correctamente.`,
      });

      setDeleteDialogOpen(false);
      setDeletingUser(null);
      fetchUsers();
    } catch (error: unknown) {
      const detailedMessage = await resolveFunctionErrorMessage(error);
      toast({
        title: 'Error',
        description: detailedMessage || mapUserManagementError(error, 'delete'),
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const getRoleBadge = (userRole: AppRole) => {
    const variants: Record<AppRole, { label: string; className: string }> = {
      employee: { label: 'Empleado', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
      department_head: { label: 'Jefe Depto.', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300' },
      global_manager: { label: 'Gestor Global', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300' },
      superadmin: { label: 'Superadmin', className: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-300' },
    };
    return (
      <Badge className={variants[userRole].className}>
        {variants[userRole].label}
      </Badge>
    );
  };

  if (role !== 'global_manager' && role !== 'superadmin') {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No tienes permisos para acceder a esta página</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gestión de Usuarios</h1>
            <p className="text-muted-foreground">
              Administra usuarios, roles y permisos del sistema
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Crear Usuario
          </Button>
        </div>

        {/* Stats cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Usuarios</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Jefes de Depto.</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {users.filter(u => u.role === 'department_head').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gestores Globales</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {users.filter(u => u.role === 'global_manager' || u.role === 'superadmin').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Usuarios del Sistema</CardTitle>
                <CardDescription>
                  Haz clic en un usuario para editar su rol y departamento.
                  {role !== 'superadmin' ? ' Solo superadmin puede eliminar usuarios.' : ''}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Departamento" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="all">Todos los deptos.</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterRole} onValueChange={setFilterRole}>
                  <SelectTrigger className="w-[160px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Rol" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="all">Todos los roles</SelectItem>
                    <SelectItem value="employee">Empleado</SelectItem>
                    <SelectItem value="department_head">Jefe de Depto.</SelectItem>
                    <SelectItem value="global_manager">Gestor Global</SelectItem>
                    {role === 'superadmin' && <SelectItem value="superadmin">Superadmin</SelectItem>}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as 'active' | 'inactive' | 'all')}>
                  <SelectTrigger className="w-[170px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="active">Activos</SelectItem>
                    <SelectItem value="inactive">Papelera</SelectItem>
                    <SelectItem value="all">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {users.length === 0 ? 'No hay usuarios registrados' : 'No hay usuarios que coincidan con los filtros'}
              </div>
            ) : (
              <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Departamento</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Última conexión</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.full_name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div>{user.department_name}</div>
                          {user.role === 'department_head' && user.managed_department_names.length > 1 && (
                            <p className="text-xs text-muted-foreground">
                              Responsable también de: {user.managed_department_names.filter((name) => name !== user.department_name).join(', ')}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell>
                        {user.is_active ? (
                          <Badge variant="secondary">Activo</Badge>
                        ) : (
                          <div className="space-y-1">
                            <Badge variant="outline" className="border-amber-400 text-amber-700">Papelera</Badge>
                            <p className="text-xs text-muted-foreground">
                              {user.contract_cancelled_at ? `Baja: ${user.contract_cancelled_at}` : 'Sin fecha'}
                            </p>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatLastConnection(user.last_connection_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {user.is_active && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditUser(user)}
                                aria-label={`Editar ${user.full_name}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenDeactivateDialog(user)}
                                disabled={currentUser?.id === user.user_id}
                                aria-label={`Dar de baja ${user.full_name}`}
                                className="text-amber-600 hover:text-amber-700"
                              >
                                <UserX className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {!user.is_active && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRestoreUser(user)}
                              aria-label={`Restaurar ${user.full_name}`}
                              className="text-emerald-600 hover:text-emerald-700"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          {canDeleteUsers && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenDeleteDialog(user)}
                              disabled={currentUser?.id === user.user_id}
                              aria-label={`Eliminar ${user.full_name}`}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Mostrando {(currentPage - 1) * USERS_PAGE_SIZE + 1}-{Math.min(currentPage * USERS_PAGE_SIZE, filteredUsers.length)} de {filteredUsers.length} usuarios
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage <= 1}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">Página {currentPage} de {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Usuario</DialogTitle>
              <DialogDescription>
                Modifica el rol, departamento principal y responsabilidades adicionales
              </DialogDescription>
            </DialogHeader>
            
            {editingUser && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={editingUser.full_name} disabled />
                </div>
                
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={editingUser.email} disabled />
                </div>
                
                <div className="space-y-2">
                  <Label>Departamento</Label>
                  <Select value={selectedDepartment} onValueChange={(value) => {
                    setSelectedDepartment(value);
                    setSelectedManagedDepartments((current) => Array.from(new Set([value, ...current])));
                  }}>
                    <SelectTrigger>
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
                </div>
                
                <div className="space-y-2">
                  <Label>Rol</Label>
                  <Select value={selectedRole} onValueChange={(val) => setSelectedRole(val as AppRole)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona rol" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="employee">Empleado</SelectItem>
                      <SelectItem value="department_head">Jefe de Departamento</SelectItem>
                      <SelectItem value="global_manager">Gestor Global</SelectItem>
                    {role === 'superadmin' && <SelectItem value="superadmin">Superadmin</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>

                {selectedRole === 'department_head' && (
                  <div className="space-y-2">
                    <Label>Departamentos bajo su responsabilidad</Label>
                    <div className="max-h-48 overflow-auto rounded-md border p-3 space-y-3">
                      {departments.map((department) => {
                        const checked = selectedManagedDepartments.includes(department.id) || department.id === selectedDepartment;
                        return (
                          <label key={department.id} className="flex items-center gap-3 text-sm">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => toggleManagedDepartment(department.id, Boolean(value))}
                              disabled={department.id === selectedDepartment}
                            />
                            <span>
                              {department.name}
                              {department.id === selectedDepartment ? ' (principal)' : ''}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">Solo superadmin y gestor global pueden gestionar estas responsabilidades múltiples.</p>
                  </div>
                )}
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveUser} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar cambios'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción eliminará permanentemente a <strong>{deletingUser?.full_name}</strong> del sistema.
                Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  handleDeleteUser();
                }}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  'Eliminar usuario'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dar de baja al trabajador</DialogTitle>
              <DialogDescription>
                El usuario dejará de aparecer en módulos operativos y quedará en la papelera de reciclaje.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-3">
              <div className="space-y-2">
                <Label>Motivo de baja</Label>
                <Input
                  value={deactivationReason}
                  onChange={(event) => setDeactivationReason(event.target.value)}
                  placeholder="Ej: fin de contrato, renuncia, despido, etc."
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha de cancelación de contrato</Label>
                <Input
                  type="date"
                  value={contractCancelledAt}
                  onChange={(event) => setContractCancelledAt(event.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeactivateDialogOpen(false)} disabled={deactivating}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDeactivateUser} disabled={deactivating}>
                {deactivating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Confirmar baja'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create user dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nuevo Usuario</DialogTitle>
              <DialogDescription>
                Crea un nuevo usuario con acceso inmediato al sistema
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="newUserName">Nombre completo</Label>
                <Input
                  id="newUserName"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Nombre del usuario"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="newUserEmail">Email</Label>
                <Input
                  id="newUserEmail"
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="newUserPassword">Contraseña</Label>
                <Input
                  id="newUserPassword"
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Departamento</Label>
                <Select value={newUserDepartment} onValueChange={setNewUserDepartment}>
                  <SelectTrigger>
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
              </div>
              
              <div className="space-y-2">
                <Label>Rol</Label>
                <Select value={newUserRole} onValueChange={(val) => setNewUserRole(val as AppRole)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona rol" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="employee">Empleado</SelectItem>
                    <SelectItem value="department_head">Jefe de Departamento</SelectItem>
                    <SelectItem value="global_manager">Gestor Global</SelectItem>
                    {role === 'superadmin' && <SelectItem value="superadmin">Superadmin</SelectItem>}
                  </SelectContent>
                </Select>
              </div>

              {createError && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  {createError}
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateUser} disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Crear Usuario
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
