export type RoleLike = 'employee' | 'department_head' | 'global_manager' | 'superadmin';

const ROLE_PRIORITY: Record<RoleLike, number> = {
  employee: 1,
  department_head: 2,
  global_manager: 3,
  superadmin: 4,
};

export function getHighestRole(roles: Array<string | null | undefined>): RoleLike {
  let highest: RoleLike = 'employee';

  for (const role of roles) {
    if (!role) continue;
    if (!(role in ROLE_PRIORITY)) continue;

    const typedRole = role as RoleLike;
    if (ROLE_PRIORITY[typedRole] > ROLE_PRIORITY[highest]) {
      highest = typedRole;
    }
  }

  return highest;
}
