import bcrypt from "bcryptjs";
import { ApiError } from "../middleware/errorHandler.js";
import { createUser, findUserByEmail, findUserById } from "../repositories/user.repository.js";
import { signToken } from "../utils/jwt.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

export async function registerHandler(req, res) {
  const { name, email, password } = req.body || {};

  if (!name || !name.trim()) {
    throw new ApiError(400, "Name is required");
  }
  if (!email || !EMAIL_RE.test(email)) {
    throw new ApiError(400, "A valid email is required");
  }
  if (!password || password.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters");
  }

  const existing = await findUserByEmail(email.toLowerCase());
  if (existing) {
    throw new ApiError(409, "An account with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await createUser({ name: name.trim(), email: email.toLowerCase(), passwordHash });

  const token = signToken(user);
  req.session.userId = user.id;

  res.status(201).json({ user: publicUser(user), token });
}

export async function loginHandler(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await findUserByEmail(email.toLowerCase());
  if (!user) {
    throw new ApiError(401, "Invalid email or password");
  }

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    throw new ApiError(401, "Invalid email or password");
  }

  const token = signToken(user);
  req.session.userId = user.id;

  res.json({ user: publicUser(user), token });
}

export function logoutHandler(req, res) {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
}

export async function meHandler(req, res) {
  const user = await findUserById(req.userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  res.json({ user: publicUser(user) });
}
