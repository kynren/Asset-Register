import "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        roleId: number;
        roleName: string;
      };
    }
  }
}

export {};
