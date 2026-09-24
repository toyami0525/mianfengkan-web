// The staff directory still contains historical service labels. Keep the
// booking names consistent without rewriting anybody's profile.
export type StaffServiceProfile = {id?: string; slug?: string; services?: unknown};
export type StaffServiceAvailability = {staff_id: string; service_name: string; enabled: boolean};
const aliases: Record<string, string> = {
  '泡湯搓澡': '泡湯洗浴', '按摩': '按摩服務', '枕邊談心': '耳語陪伴',
  '駐店繪師(公版)': 'Q版繪圖(公版)', '拍立得': '紀念拍立得',
};
const bookableServices = new Set(['泡湯洗浴', '按摩服務', '耳語陪伴', 'Q版繪圖(公版)', '簽繪拍立得', '拍立得(無簽繪)', '紀念拍立得']);
export function normalizeServiceName(name: string): string { return aliases[name] || name; }
export function staffServiceOptions(staff: StaffServiceProfile): string[] {
  if (staff.slug === 'riku') return [];
  if (staff.slug === 'shenaixue' || staff.slug === 'sai') return ['耳語陪伴'];
  if (staff.slug === 'yukinoji-hakari') return ['耳語陪伴', 'Q版繪圖(公版)', '紀念拍立得'];
  if (staff.slug === 'lina') return ['簽繪拍立得', '拍立得(無簽繪)'];
  return [...new Set((Array.isArray(staff.services) ? staff.services : [])
    .map(String).map(normalizeServiceName).filter(name => bookableServices.has(name)))];
}
export function staffServiceState(staff: StaffServiceProfile, availability: StaffServiceAvailability[]) {
  const service_options = staffServiceOptions(staff);
  const paused = new Set(availability.filter(row => row.staff_id === staff.id && row.enabled === false).map(row => row.service_name));
  return {service_options, available_services: service_options.filter(name => !paused.has(name))};
}
export function requestedServiceNames(names: string[], polaroid = false): string[] {
  return [...new Set(names.flatMap(name => name === '眠楓套席'
    ? ['泡湯洗浴', '按摩服務', '耳語陪伴'] : [normalizeServiceName(name)])
    .concat(polaroid ? ['紀念拍立得'] : []))];
}
