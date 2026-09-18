import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/ashenrila', destination: '/ashenrila/index.html' },
      { source: '/ashenrila/invitation', destination: '/ashenrila/invitation/index.html' },
      { source: '/ashenrila/drinks', destination: '/ashenrila/drinks/index.html' },
      { source: '/ashenrila/staff', destination: '/ashenrila/staff/index.html' },
      { source: '/ashenrila/visit', destination: '/ashenrila/visit/index.html' }
    ];
  },
  async redirects() {
    return [
      { source: '/', destination: '/index.html', permanent: false },
      { source: '/about', destination: '/about.html', permanent: false },
      { source: '/survey', destination: '/survey.html', permanent: false },
      { source: '/services', destination: '/services.html', permanent: false },
      { source: '/staff', destination: '/staff.html', permanent: false },
      { source: '/menu', destination: '/menu.html', permanent: false },
      { source: '/rules', destination: '/rules.html', permanent: false },
      { source: '/location', destination: '/location.html', permanent: false },
      { source: '/reserve', destination: '/reserve.html', permanent: false },
      { source: '/order', destination: '/order.html', permanent: false }
    ];
  }
};
export default nextConfig;
