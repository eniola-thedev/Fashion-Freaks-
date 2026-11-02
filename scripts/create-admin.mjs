import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import readline from "node:readline";
import { stdin, stdout } from "node:process";

const prisma = new PrismaClient();

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

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new Error(
      "An account with that email already exists."
    );
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

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  console.log("\nAdministrator created successfully.");
  console.log(user);
}

main()
  .catch((error) => {
    console.error("\nCould not create administrator:");
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await prisma.$disconnect();
  });