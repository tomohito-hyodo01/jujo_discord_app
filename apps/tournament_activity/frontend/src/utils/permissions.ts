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
  | 'view_app_logs'
  | 'view_referee_training'
  | 'manage_practice_reservations'

// admin_role: 0=管理者, 1=大会申込管理者, 2=一般
// member_level: 0=正会員, 1=準会員, 2=ゲスト, 3=未所属

const ADMIN_ROLE_PERMISSIONS: Record<number, Permission[]> = {
  0: ['view_dashboard', 'view_event_list', 'view_player', 'view_apply', 'view_my_registrations', 'view_tournament_register', 'view_excel_download', 'view_practice_manage', 'view_member_list', 'view_app_logs'],
  1: ['view_dashboard', 'view_event_list', 'view_player', 'view_apply', 'view_my_registrations', 'view_tournament_register', 'view_excel_download', 'view_practice_manage'],
  2: ['view_dashboard', 'view_event_list', 'view_player', 'view_apply', 'view_my_registrations'],
}

export interface UserPermissionInfo {
  adminRole: number   // 0:管理者, 1:大会申込管理者, 2:一般
  memberLevel: number // 0:正会員, 1:準会員, 2:ゲスト
  practiceAdmin?: number // 0:一般, 1:練習管理者
}

export function getRoleName(adminRole: number, practiceAdmin?: number): string {
  const roles: string[] = []
  switch (adminRole) {
    case 0: roles.push('管理者'); break
    case 1: roles.push('大会申込管理者'); break
  }
  if (practiceAdmin === 1) roles.push('練習管理者')
  return roles.length > 0 ? roles.join('・') : 'メンバー'
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
  // 審判講習は正会員のみ
  if (permission === 'view_referee_training') {
    return info.memberLevel === 0
  }
  // コート予約管理は管理者 or 練習管理者
  if (permission === 'manage_practice_reservations') {
    return info.adminRole === 0 || info.practiceAdmin === 1
  }
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
