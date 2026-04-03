import { createApp } from "vue";
import { createPinia } from "pinia";
import {
  ElButton,
  ElCheckbox,
  ElConfigProvider,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
} from "element-plus";
import "element-plus/es/components/button/style/css";
import "element-plus/es/components/checkbox/style/css";
import "element-plus/es/components/config-provider/style/css";
import "element-plus/es/components/empty/style/css";
import "element-plus/es/components/form/style/css";
import "element-plus/es/components/form-item/style/css";
import "element-plus/es/components/input/style/css";
import App from "./App.vue";

import router from "./router/index";

const app = createApp(App);

app.component("ElButton", ElButton);
app.component("ElCheckbox", ElCheckbox);
app.component("ElConfigProvider", ElConfigProvider);
app.component("ElEmpty", ElEmpty);
app.component("ElForm", ElForm);
app.component("ElFormItem", ElFormItem);
app.component("ElInput", ElInput);

app.use(createPinia());
app.use(router);

app.mount("#app");
