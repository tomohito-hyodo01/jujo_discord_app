export type Permission =
  | 'view_dashboard'
  | 'view_player'
  | 'view_apply'
  | 'view_tournament_register'
  | 'view_member_list'
  | 'view_my_registrations'
  | 'view_excel_download'
  | 'view_practice_manage'
  | 'view_event_list'

// admin_role: 0=管理者, 1=大会申込管理者, 2=一般
// member_level: 0=正会員, 1=準会員, 2=ゲスト, 3=未所属

const ADMIN_ROLE_PERMISSIONS: Record<number, Permission[]> = {
  0: ['view_dashboard', 'view_event_list', 'view_player', 'view_apply', 'view_my_registrations', 'view_tournament_register', 'view_excel_download', 'view_practice_manage', 'view_member_list'],
  1: ['view_dashboard', 'view_event_list', 'view_player', 'view_apply', 'view_my_registrations', 'view_tournament_register', 'view_excel_download', 'view_practice_manage'],
  2: ['view_dashboard', 'view_event_list', 'view_player', 'view_apply', 'view_my_registrations'],
}

export interface UserPermissionInfo {
  adminRole: number   // 0:管理者, 1:大会申込管理者, 2:一般
  memberLevel: number // 0:正会員, 1:準会員, 2:ゲスト
}

export function getRoleName(adminRole: number): string {
  switch (adminRole) {
    case 0: return '管理者'
    case 1: return '大会申込管理者'
    default: return 'メンバー'
  }
}

export function getMemberLevelName(memberLevel: number): string {
  switch (memberLevel) {
    case 0: return '正会員'
    case 1: return '準会員'
    case 2: return 'ゲスト'
    default: return '未所属'
  }
}

// memberLevel=2(ゲスト)はダッシュボード（練習日程のみ）に制限
const GUEST_PERMISSIONS: Permission[] = ['view_dashboard', 'view_event_list']

export function hasPermission(info: UserPermissionInfo, permission: Permission): boolean {
  if (info.memberLevel === 2) {
    return GUEST_PERMISSIONS.includes(permission)
  }
  const perms = ADMIN_ROLE_PERMISSIONS[info.adminRole] ?? ADMIN_ROLE_PERMISSIONS[2]
  return perms.includes(permission)
}

export function getUserPermissions(info: UserPermissionInfo): Permission[] {
  if (info.memberLevel === 2) {
    return GUEST_PERMISSIONS
  }
  return ADMIN_ROLE_PERMISSIONS[info.adminRole] ?? ADMIN_ROLE_PERMISSIONS[2]
}
