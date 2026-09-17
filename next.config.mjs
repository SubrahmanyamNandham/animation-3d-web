/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-59a4354e0fed40cd808b1a033087eafd.r2.dev",
        pathname: "/free/Florma/**",
      },
    ],
    // Several brand/client-logo assets are .svg — next/image blocks SVG by
    // default, so this opts in with the CSP Next.js recommends for it.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
