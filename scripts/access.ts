import { readFileSync, existsSync } from "node:fs";
const file = ".local/first-access.json";
if (!existsSync(file))
  throw new Error(
    "Nenhum acesso gerado automaticamente. Use suas credenciais ou execute npm run setup.",
  );
const { email, password, username } = JSON.parse(
  readFileSync(file, "utf8"),
) as {
  username?: string;
  email: string;
  password: string;
};
console.log(
  `Acesso inicial local (pode ter sido alterado por você):\nUsuário: ${username || (email === "admin@jotage.local" ? "admin123" : email)}\nSenha: ${password}\n\nNão compartilhe este arquivo ou esta saída. Altere a senha em Configurações e remova o arquivo após guardar seu acesso.`,
);
