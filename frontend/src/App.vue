<template>
  <el-config-provider>
    <router-view />
  </el-config-provider>
</template>

<style>
#app {
  height: 100vh;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
:root {
  --theme-color: #3e3e3e;
  --theme-theme: #133ab3;
  --theme-background: #fafafa;
  --theme-other_background: #ffffff;
}
html,
body {
  margin: 0;
  font-size: 15px;
  font-family:
    v-sans,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    Segoe UI,
    sans-serif,
    "Apple Color Emoji",
    "Segoe UI Emoji",
    Segoe UI Symbol;
  line-height: 1.6;
  color: var(--theme-color);
  background-color: var(--theme-background);
  word-wrap: break-word;
}

body {
  position: fixed;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
