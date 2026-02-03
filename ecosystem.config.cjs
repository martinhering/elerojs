/**
 * PM2 ecosystem file for elerojs.
 * Usage: pm2 start ecosystem.config.cjs
 *
 * Set SERIAL_PORT (required) and optional vars below or in .env.
 */

module.exports = {
  apps: [
    {
      name: 'elerojs',
      script: 'src/index.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        SERIAL_PORT: '/dev/ttyUSB0',
        HTTP_PORT: '3000',
        WS_ENABLE: 'true',
        COMMAND_DELAY_MS: '500',
        SERIAL_OPEN_DELAY_MS: '2000',
        // LATITUDE: '52.52',
        // LONGITUDE: '13.405',
        // GEO_LOCATION: '52.52,13.405',
      },
      env_production: {
        SERIAL_PORT: '/dev/ttyUSB0',
        HTTP_PORT: '3000',
        WS_ENABLE: 'true',
        COMMAND_DELAY_MS: '500',
        SERIAL_OPEN_DELAY_MS: '2000',
        // LATITUDE: '52.52',
        // LONGITUDE: '13.405',
        // GEO_LOCATION: '52.52,13.405',
      },
    },
  ],
};
