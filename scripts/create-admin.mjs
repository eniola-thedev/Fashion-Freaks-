import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";
import readline from "node:readline";
import { stdin, stdout } from "node:process";

nextEnv.loadEnvConfig(process.cwd());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to create an administrator."
  );
}
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const rl = readline.createInterface({
  input: stdin,
  output: stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

// Read a password without displaying the characters typed.
function askHidden(question) {
  return new Promise((resolve) => {
    stdout.write(question);

    let password = "";

    const onData = (buffer) => {
      for (const character of buffer.toString()) {
        if (character === "\u0003") {
          stdin.setRawMode?.(false);
          stdout.write("\n");
          process.exit(1);
        }

        if (character === "\r" || character === "\n") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          stdout.write("\n");
          resolve(password);
          return;
        }

        if (character === "\u007f" || character === "\b") {
          password = password.slice(0, -1);
        } else {
          password += character;
        }
      }
    };

    stdin.resume();
    stdin.setRawMode(true);
    stdin.on("data", onData);
  });
}

async function main() {
  const email = (await ask("Admin email: "))
    .trim()
    .toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Please enter a valid email address.");
  }

  const password = await askHidden("Admin password: ");

  if (password.length < 12) {
    throw new Error(
      "Use a password with at least 12 characters."
    );
  }

  const confirmation = await askHidden(
    "Confirm password: "
  );

  if (password !== confirmation) {
    throw new Error("The passwords do not match.");
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Store administrator" },
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "Supabase did not create the administrator.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("UserProfile")
    .update({ email, role: "ADMIN", isActive: true })
    .eq("id", data.user.id)
    .select("id, email, role")
    .single();
  if (profileError) {
    const { error: cleanupError } = await supabase.auth.admin.deleteUser(
      data.user.id
    );
    if (cleanupError) {
      throw new Error(
        `Could not promote the administrator (${profileError.message}); the new auth user also could not be removed (${cleanupError.message}).`
      );
    }
    throw new Error(
      `Could not promote the administrator. The new auth user was removed: ${profileError.message}`
    );
  }

  console.log("\nAdministrator created successfully.");
  console.log(profile);
}

main()
  .catch((error) => {
    console.error("\nCould not create administrator:");
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
  });