<template>
  <div class="login-page">
    <section class="login-card">
      <div class="login-card__header">
        <p>CloudSaver Search</p>
        <h1>登录后开始搜索</h1>
        <span>当前版本仅保留搜索能力，账号密码由服务端环境变量控制。</span>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            autocomplete="current-password"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <div class="login-card__options">
          <el-checkbox v-model="rememberPassword">记住密码</el-checkbox>
        </div>
        <el-button type="primary" class="login-card__submit" :loading="loading" @click="handleLogin">
          登录
        </el-button>
      </el-form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { FormInstance, FormRules } from "element-plus";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import { userApi } from "@/api/user";
import { STORAGE_KEYS } from "@/constants/storage";

const router = useRouter();
const formRef = ref<FormInstance>();
const loading = ref(false);
const rememberPassword = ref(false);
const form = ref({
  username: "",
  password: "",
});

const rules: FormRules<typeof form.value> = {
  username: [{ required: true, message: "请输入用户名", trigger: "blur" }],
  password: [{ required: true, message: "请输入密码", trigger: "blur" }],
};

onMounted(() => {
  const savedUsername = localStorage.getItem(STORAGE_KEYS.USERNAME);
  const savedPassword = localStorage.getItem(STORAGE_KEYS.PASSWORD);
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  if (token) {
    router.replace("/search");
    return;
  }
  if (savedUsername && savedPassword) {
    form.value.username = savedUsername;
    form.value.password = savedPassword;
    rememberPassword.value = true;
  }
});

const handleLogin = async () => {
  if (!formRef.value) {
    return;
  }

  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) {
    return;
  }

  loading.value = true;
  try {
    const response = await userApi.login(form.value);
    if (response.code !== 0 || !response.data?.token) {
      ElMessage.error(response.message || "登录失败");
      return;
    }

    if (rememberPassword.value) {
      localStorage.setItem(STORAGE_KEYS.USERNAME, form.value.username);
      localStorage.setItem(STORAGE_KEYS.PASSWORD, form.value.password);
    } else {
      localStorage.removeItem(STORAGE_KEYS.USERNAME);
      localStorage.removeItem(STORAGE_KEYS.PASSWORD);
    }

    localStorage.setItem(STORAGE_KEYS.TOKEN, response.data.token);
    await router.replace("/search");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "登录失败");
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped lang="scss">
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(250, 178, 95, 0.24), transparent 26%),
    radial-gradient(circle at bottom right, rgba(74, 154, 201, 0.18), transparent 34%),
    linear-gradient(180deg, #f4ecdf 0%, #eef5f7 100%);
}

.login-card {
  width: min(100%, 440px);
  padding: 32px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 20px 60px rgba(40, 62, 81, 0.12);
}

.login-card__header p {
  margin: 0 0 8px;
  color: #8c6f41;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  font-size: 12px;
}

.login-card__header h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1.1;
  color: #172130;
}

.login-card__header span {
  display: block;
  margin: 14px 0 24px;
  color: #576473;
  line-height: 1.7;
}

.login-card__options {
  margin-bottom: 20px;
}

.login-card__submit {
  width: 100%;
  height: 44px;
}

@media (max-width: 768px) {
  .login-page {
    padding: 16px;
  }

  .login-card {
    padding: 24px 20px;
    border-radius: 22px;
  }

  .login-card__header h1 {
    font-size: 26px;
  }
}
</style>
