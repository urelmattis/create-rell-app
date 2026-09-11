// Babel config for the Expo + NativeWind pipeline (Story 4.3).
//
// NativeWind 4 requires the `nativewind/babel` preset chained AFTER
// `babel-preset-expo` (order matters — Expo must process its JSX/TS first).
// The `jsxImportSource: 'nativewind'` option enables the `className` prop on
// React Native primitives at the type + runtime layer.

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
