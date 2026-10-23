// All settings come from the environment (systemd EnvironmentFile on the server).
// Secrets never live in the repo.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 8791),
  host: process.env.HOST ?? "127.0.0.1",
  dataDir: process.env.DATA_DIR ?? "/opt/voicememo/data",
  // Static software-source root served by nginx at SOURCE_BASE.
  sourceRoot: process.env.SOURCE_ROOT ?? "/var/www/apps",
  sourceBase: process.env.SOURCE_BASE ?? "https://apps.gugenzzz.top",
  appToken: required("APP_TOKEN"),
  adminToken: required("ADMIN_TOKEN"),
  groqKey: required("GROQ_API_KEY"),
  groqModel: process.env.GROQ_MODEL ?? "whisper-large-v3-turbo",
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-sonnet-5",
};
