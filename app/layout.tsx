import './admin.css';
export const metadata = { title: '眠楓館', robots: { index: false, follow: false } };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-Hant-TW"><body>{children}</body></html>}
