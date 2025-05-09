/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  onDemandEntries: {
    // Keep server-side pages in memory for longer during development
    maxInactiveAge: 25 * 1000,
    // Number of pages to keep in memory
    pagesBufferLength: 4,
  },
  webpack: (config, { isServer }) => {
    // Add TypeScript loader for files outside of pages and components
    config.module.rules.push({
      test: /\.tsx?$/,
      use: [
        {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
      ],
      include: [/src/, /lib/],
    });

    // Handle Node.js built-in modules
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        zlib: false,
        stream: false,
        http: false,
        https: false,
        crypto: false,
        path: false,
        os: false,
        util: false,
        buffer: false,
        assert: false,
        child_process: false
      };
    }

    // Add support for importing ESM modules
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts', '.tsx'],
      '.mjs': ['.mjs', '.mts', '.mtsx'],
    };

    // Add module resolution for turbomq
    config.resolve.alias = {
      ...config.resolve.alias,
      'turbomq': '../../../src/index.js',
    };

    return config;
  },
  // Enable TypeScript strict mode
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    esmExternals: true
  }
};

export default nextConfig;
