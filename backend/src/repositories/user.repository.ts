import { query } from "../database/pool";

export async function createUser({ name, email, passwordHash }) {
  const result = await query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email, created_at`,
    [name, email, passwordHash]
  );
  return result.rows[0];
}

export async function findUserByEmail(email) {
  const result = await query(`SELECT * FROM users WHERE email = $1`, [email]);
  return result.rows[0] || null;
}

export async function findUserById(id) {
  const result = await query(`SELECT id, name, email, created_at FROM users WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

export async function findUserWithPasswordById(id) {
  const result = await query(`SELECT id, name, email, password_hash, created_at FROM users WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

export async function updateUserAccount(id, updates: { name?: string; passwordHash?: string }) {
  const { name, passwordHash } = updates;
  const sets = [];
  const params = [];

  if (name != null) {
    params.push(name);
    sets.push(`name = $${params.length}`);
  }
  if (passwordHash != null) {
    params.push(passwordHash);
    sets.push(`password_hash = $${params.length}`);
  }

  sets.push("updated_at = now()");
  params.push(id);

  const result = await query(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING id, name, email, created_at`,
    params
  );
  return result.rows[0] || null;
}
