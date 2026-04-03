import { createRouter, createWebHistory } from "vue-router";
import { STORAGE_KEYS } from "@/constants/storage";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      redirect: "/search",
    },
    {
      path: "/search",
      name: "search",
      component: () => import("@/views/SearchPage.vue"),
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginPage.vue"),
    },
  ],
});

router.beforeEach((to) => {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  if (to.meta.requiresAuth && !token) {
    return "/login";
  }
  if (to.path === "/login" && token) {
    return "/search";
  }
  return true;
});

export default router;
