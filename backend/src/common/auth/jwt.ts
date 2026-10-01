import jwt from "jsonwebtoken";
import { env } from "../../config/env";

type TokenUser = {
  id: string;
  email: string;
};

export function signToken(user: TokenUser) {
  return jwt.sign({ sub: user.id, email: user.email }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): { sub?: string; email?: string } {
  return jwt.verify(token, env.jwtSecret) as { sub?: string; email?: string };
}
