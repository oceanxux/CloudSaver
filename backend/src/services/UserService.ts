import jwt from "jsonwebtoken";
import { config } from "../config";

export class UserService {
  private isValidInput(input: string): boolean {
    // 检查是否包含空格或汉字
    const regex = /^[^\s\u4e00-\u9fa5]+$/;
    return regex.test(input);
  }

  async register(username: string, password: string, registerCode: string) {
    if (!this.isValidInput(username) || !this.isValidInput(password)) {
      throw new Error("用户名、密码或注册码不能包含空格或汉字");
    }
    if (!registerCode) {
      throw new Error("搜索版不支持注册，请使用环境变量配置账号");
    }
    throw new Error("搜索版不支持注册，请使用环境变量配置账号");
  }

  async login(username: string, password: string) {
    if (!username || !password) {
      throw new Error("用户名或密码不能为空");
    }
    if (!this.isValidInput(username) || !this.isValidInput(password)) {
      throw new Error("用户名或密码不能包含空格或汉字");
    }
    if (username !== config.auth.username || password !== config.auth.password) {
      throw new Error("用户名或密码错误");
    }

    const token = jwt.sign({ userId: "search-admin", role: 0 }, config.jwtSecret, {
      expiresIn: "6h",
    });

    return {
      data: {
        token,
      },
    };
  }
}
