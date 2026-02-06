/**
 * Data Migration / Seed Script for GRW CRM
 *
 * Reads JSON backup files from the old servicemanager project and imports
 * them into the new GRW CRM database via Prisma.
 *
 * Usage:
 *   npx tsx prisma/seed.ts           # Import (skips existing records)
 *   npx tsx prisma/seed.ts --clean   # Wipe all tables first, then import
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL,
});

const CLEAN_MODE = process.argv.includes("--clean");

// Path to backup data directory
const BACKUP_DIR = path.resolve(
  "C:\\Users\\zyrkr\\Documents\\servicemanager-main\\data_backup\\2026-02-05T20-56-46-467Z"
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJSON<T>(filename: string): T[] {
  const filePath = path.join(BACKUP_DIR, filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T[];
}

function toDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  return new Date(val);
}

function toDateRequired(val: string): Date {
  return new Date(val);
}

const summary: { table: string; count: number; status: string }[] = [];

function logResult(table: string, count: number, status: string) {
  summary.push({ table, count, status });
  const icon = status.startsWith("OK") ? "[OK]" : "[FAIL]";
  console.log(`  ${icon} ${table}: ${count} records ${status.startsWith("OK") ? "imported" : "- " + status}`);
}

// ─── Clean ────────────────────────────────────────────────────────────────────

async function cleanAllTables() {
  console.log("Cleaning all tables (--clean mode)...\n");
  // Delete in reverse dependency order
  await prisma.categorizationRule.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.bankTransaction.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.serviceLog.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.plaidItem.deleteMany();
  await prisma.transactionCategory.deleteMany();
  await prisma.serviceType.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.settings.deleteMany();
  await prisma.user.deleteMany();
  console.log("  All tables cleared.\n");
}

// ─── Import Functions ─────────────────────────────────────────────────────────

async function importUsers() {
  const data = readJSON<any>("users.json");
  let count = 0;
  for (const u of data) {
    const record = {
      name: u.name,
      email: u.email,
      emailVerified: toDate(u.emailVerified),
      password: u.password,
      image: u.image ?? null,
      createdAt: toDateRequired(u.createdAt),
      updatedAt: toDateRequired(u.updatedAt),
    };
    await prisma.user.upsert({
      where: { id: u.id },
      update: record,
      create: { id: u.id, ...record },
    });
    count++;
  }
  logResult("User", count, "OK");
}

async function importSettings() {
  const data = readJSON<any>("settings.json");
  let count = 0;
  for (const s of data) {
    const record = {
      companyName: s.companyName ?? null,
      companyAddress: s.companyAddress ?? null,
      companyCity: s.companyCity ?? null,
      companyState: s.companyState ?? null,
      companyZip: s.companyZip ?? null,
      companyPhone: s.companyPhone ?? null,
      companyEmail: s.companyEmail ?? null,
      companyWebsite: s.companyWebsite ?? null,
      createdAt: toDateRequired(s.createdAt),
      updatedAt: toDateRequired(s.updatedAt),
    };
    await prisma.settings.upsert({
      where: { id: s.id },
      update: record,
      create: { id: s.id, ...record },
    });
    count++;
  }
  logResult("Settings", count, "OK");
}

async function importCustomers() {
  const data = readJSON<any>("customers.json");
  let count = 0;
  for (const c of data) {
    const record = {
      name: c.name,
      phone: c.phone,
      email: c.email ?? null,
      address: c.address,
      serviceInterval: c.serviceInterval ?? null,
      userId: c.userId,
      createdAt: toDateRequired(c.createdAt),
      updatedAt: toDateRequired(c.updatedAt),
    };
    await prisma.customer.upsert({
      where: { id: c.id },
      update: record,
      create: { id: c.id, ...record },
    });
    count++;
  }
  logResult("Customer", count, "OK");
}

async function importServiceTypes() {
  const data = readJSON<any>("service_types.json");
  let count = 0;
  for (const st of data) {
    const record = {
      name: st.name,
      slug: st.slug,
      description: st.description ?? null,
      color: st.color ?? null,
      icon: st.icon ?? null,
      position: st.position,
      userId: st.userId,
      createdAt: toDateRequired(st.createdAt),
      updatedAt: toDateRequired(st.updatedAt),
    };
    await prisma.serviceType.upsert({
      where: { id: st.id },
      update: record,
      create: { id: st.id, ...record },
    });
    count++;
  }
  logResult("ServiceType", count, "OK");
}

async function importPlaidItems() {
  const data = readJSON<any>("plaid_items.json");
  let count = 0;
  for (const pi of data) {
    const record = {
      userId: pi.userId,
      itemId: pi.itemId,
      accessToken: pi.accessToken,
      institutionId: pi.institutionId ?? null,
      institutionName: pi.institutionName ?? null,
      webhookUrl: pi.webhookUrl ?? null,
      consentExpiresAt: toDate(pi.consentExpiresAt),
      status: pi.status,
      lastError: pi.lastError ?? null,
      lastSuccessfulSync: toDate(pi.lastSuccessfulSync),
      cursor: null,
      createdAt: toDateRequired(pi.createdAt),
      updatedAt: toDateRequired(pi.updatedAt),
    };
    await prisma.plaidItem.upsert({
      where: { id: pi.id },
      update: record,
      create: { id: pi.id, ...record },
    });
    count++;
  }
  logResult("PlaidItem", count, "OK");
}

async function importBankAccounts() {
  const data = readJSON<any>("bank_accounts.json");
  let count = 0;
  for (const ba of data) {
    const record = {
      name: ba.name,
      accountNumber: ba.accountNumber ?? null,
      type: ba.type,
      isActive: ba.isActive,
      userId: ba.userId,
      lastSyncedAt: toDate(ba.lastSyncedAt),
      mask: ba.mask ?? null,
      officialName: ba.officialName ?? null,
      plaidAccountId: ba.plaidAccountId ?? null,
      plaidItemId: ba.plaidItemId ?? null,
      subtype: ba.subtype ?? null,
      createdAt: toDateRequired(ba.createdAt),
      updatedAt: toDateRequired(ba.updatedAt),
    };
    await prisma.bankAccount.upsert({
      where: { id: ba.id },
      update: record,
      create: { id: ba.id, ...record },
    });
    count++;
  }
  logResult("BankAccount", count, "OK");
}

async function importServiceLogs() {
  const data = readJSON<any>("service_logs.json");
  let count = 0;
  for (const sl of data) {
    const record = {
      customerId: sl.customerId,
      serviceName: sl.serviceName,
      serviceDate: toDateRequired(sl.serviceDate),
      priceCharged: sl.priceCharged,
      notes: sl.notes ?? null,
      status: sl.status,
      paymentStatus: sl.paymentStatus,
      amountPaid: sl.amountPaid,
      paymentDate: toDate(sl.paymentDate),
      serviceTypeId: sl.serviceTypeId ?? null,
      totalDurationMinutes: sl.totalDurationMinutes ?? null,
      userId: sl.userId ?? null,
      createdAt: toDateRequired(sl.createdAt),
      updatedAt: toDateRequired(sl.updatedAt),
    };
    await prisma.serviceLog.upsert({
      where: { id: sl.id },
      update: record,
      create: { id: sl.id, ...record },
    });
    count++;
  }
  logResult("ServiceLog", count, "OK");
}

async function importTimeEntries() {
  const data = readJSON<any>("time_entries.json");
  let count = 0;
  for (const te of data) {
    const record = {
      serviceLogId: te.serviceLogId,
      date: toDateRequired(te.date),
      durationMinutes: te.durationMinutes,
      description: te.description ?? null,
      createdAt: toDateRequired(te.createdAt),
      updatedAt: toDateRequired(te.updatedAt),
    };
    await prisma.timeEntry.upsert({
      where: { id: te.id },
      update: record,
      create: { id: te.id, ...record },
    });
    count++;
  }
  logResult("TimeEntry", count, "OK");
}

async function importTransactionCategories() {
  const data = readJSON<any>("transaction_categories.json");

  // Sort so that categories without parentId come first (parents before children).
  const sorted = [...data].sort((a, b) => {
    if (a.parentId === null && b.parentId !== null) return -1;
    if (a.parentId !== null && b.parentId === null) return 1;
    return a.id - b.id;
  });

  let count = 0;
  for (const tc of sorted) {
    const record = {
      userId: tc.userId ?? null,
      name: tc.name,
      slug: tc.slug,
      color: tc.color,
      isDefault: tc.isDefault,
      position: tc.position,
      parentId: tc.parentId ?? null,
      isGroup: tc.isGroup,
      createdAt: toDateRequired(tc.createdAt),
      updatedAt: toDateRequired(tc.updatedAt),
    };
    await prisma.transactionCategory.upsert({
      where: { id: tc.id },
      update: record,
      create: { id: tc.id, ...record },
    });
    count++;
  }
  logResult("TransactionCategory", count, "OK");
}

async function importBankTransactions() {
  const data = readJSON<any>("bank_transactions.json");
  const BATCH_SIZE = 100;
  let imported = 0;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const mapped = batch.map((bt: any) => ({
      id: bt.id,
      date: toDateRequired(bt.date),
      description: bt.description,
      amount: bt.amount,
      balance: bt.balance ?? null,
      type: bt.type,
      notes: bt.notes ?? null,
      serviceLogId: bt.serviceLogId ?? null,
      statementMonth: bt.statementMonth,
      statementYear: bt.statementYear,
      accountId: bt.accountId,
      userId: bt.userId,
      isPending: bt.isPending ?? false,
      merchantName: bt.merchantName ?? null,
      plaidStatus: bt.plaidStatus ?? null,
      plaidTransactionId: bt.plaidTransactionId ?? null,
      rawPlaidData: bt.rawPlaidData ?? null,
      categoryId: bt.categoryId ?? null,
      createdAt: toDateRequired(bt.createdAt),
      updatedAt: toDateRequired(bt.updatedAt),
    }));

    const result = await prisma.bankTransaction.createMany({
      data: mapped,
      skipDuplicates: true,
    });
    imported += result.count;

    if ((i / BATCH_SIZE + 1) % 5 === 0 || i + BATCH_SIZE >= data.length) {
      console.log(`    ... BankTransaction batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(data.length / BATCH_SIZE)} (${imported} imported so far)`);
    }
  }
  logResult("BankTransaction", imported, "OK");
}

async function importInvoicesAndItems() {
  const data = readJSON<any>("invoices.json");
  let invoiceCount = 0;
  let itemCount = 0;

  for (const inv of data) {
    const items = inv.items || [];

    const invoiceRecord = {
      invoiceNumber: inv.invoiceNumber,
      customerId: inv.customerId,
      issueDate: toDateRequired(inv.issueDate),
      dueDate: toDate(inv.dueDate),
      status: inv.status,
      subtotal: inv.subtotal,
      total: inv.total,
      amountPaid: inv.amountPaid,
      notes: inv.notes ?? null,
      terms: inv.terms ?? null,
      serviceTypeId: inv.serviceTypeId ?? null,
      userId: inv.userId,
      createdAt: toDateRequired(inv.createdAt),
      updatedAt: toDateRequired(inv.updatedAt),
    };
    await prisma.invoice.upsert({
      where: { id: inv.id },
      update: invoiceRecord,
      create: { id: inv.id, ...invoiceRecord },
    });
    invoiceCount++;

    // Create invoice items
    for (const item of items) {
      const itemRecord = {
        invoiceId: item.invoiceId,
        serviceLogId: item.serviceLogId ?? null,
        description: item.description,
        serviceDate: toDateRequired(item.serviceDate),
        quantity: item.quantity,
        rate: item.rate,
        amount: item.amount,
        createdAt: toDateRequired(item.createdAt),
      };
      await prisma.invoiceItem.upsert({
        where: { id: item.id },
        update: itemRecord,
        create: { id: item.id, ...itemRecord },
      });
      itemCount++;
    }
  }
  logResult("Invoice", invoiceCount, "OK");
  logResult("InvoiceItem", itemCount, "OK");
}

async function importCategorizationRules() {
  const data = readJSON<any>("categorization_rules.json");
  if (data.length === 0) {
    logResult("CategorizationRule", 0, "OK (empty)");
    return;
  }
  let count = 0;
  for (const cr of data) {
    const record = {
      userId: cr.userId,
      pattern: cr.pattern,
      categoryId: cr.categoryId,
      createdAt: toDateRequired(cr.createdAt),
      updatedAt: toDateRequired(cr.updatedAt),
    };
    await prisma.categorizationRule.upsert({
      where: { id: cr.id },
      update: record,
      create: { id: cr.id, ...record },
    });
    count++;
  }
  logResult("CategorizationRule", count, "OK");
}

// ─── Sequence Reset ───────────────────────────────────────────────────────────

async function resetSequences() {
  console.log("\nResetting PostgreSQL sequences...");

  const tables = [
    "Customer",
    "ServiceType",
    "ServiceLog",
    "TimeEntry",
    "Invoice",
    "InvoiceItem",
    "BankAccount",
    "BankTransaction",
    "TransactionCategory",
    "CategorizationRule",
    "Settings",
  ];

  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${table}"), 1))`
      );
      console.log(`  [OK] ${table} sequence reset`);
    } catch (err: any) {
      console.log(`  [WARN] ${table} sequence reset failed: ${err.message}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== GRW CRM Data Migration ===");
  console.log(`Backup directory: ${BACKUP_DIR}`);
  console.log(`Mode: ${CLEAN_MODE ? "CLEAN (wipe + import)" : "UPSERT (idempotent)"}\n`);

  // Verify backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    console.error(`ERROR: Backup directory not found: ${BACKUP_DIR}`);
    process.exit(1);
  }

  // Clean if requested
  if (CLEAN_MODE) {
    await cleanAllTables();
  }

  console.log("Importing data...\n");

  // 1. Users (no dependencies)
  try {
    await importUsers();
  } catch (err: any) {
    logResult("User", 0, `FAILED: ${err.message}`);
  }

  // 2. Settings (no dependencies)
  try {
    await importSettings();
  } catch (err: any) {
    logResult("Settings", 0, `FAILED: ${err.message}`);
  }

  // 3. Customers (depends on User)
  try {
    await importCustomers();
  } catch (err: any) {
    logResult("Customer", 0, `FAILED: ${err.message}`);
  }

  // 4. Service Types (depends on User)
  try {
    await importServiceTypes();
  } catch (err: any) {
    logResult("ServiceType", 0, `FAILED: ${err.message}`);
  }

  // 5. Plaid Items (depends on User)
  try {
    await importPlaidItems();
  } catch (err: any) {
    logResult("PlaidItem", 0, `FAILED: ${err.message}`);
  }

  // 6. Bank Accounts (depends on User, PlaidItem)
  try {
    await importBankAccounts();
  } catch (err: any) {
    logResult("BankAccount", 0, `FAILED: ${err.message}`);
  }

  // 7. Service Logs (depends on Customer, ServiceType, User)
  try {
    await importServiceLogs();
  } catch (err: any) {
    logResult("ServiceLog", 0, `FAILED: ${err.message}`);
  }

  // 8. Time Entries (depends on ServiceLog)
  try {
    await importTimeEntries();
  } catch (err: any) {
    logResult("TimeEntry", 0, `FAILED: ${err.message}`);
  }

  // 9. Transaction Categories (depends on User, may self-reference via parentId)
  try {
    await importTransactionCategories();
  } catch (err: any) {
    logResult("TransactionCategory", 0, `FAILED: ${err.message}`);
  }

  // 10. Bank Transactions (depends on BankAccount, User, ServiceLog, TransactionCategory)
  try {
    await importBankTransactions();
  } catch (err: any) {
    logResult("BankTransaction", 0, `FAILED: ${err.message}`);
  }

  // 11. Invoices + Items (depends on Customer, User, ServiceLog)
  try {
    await importInvoicesAndItems();
  } catch (err: any) {
    logResult("Invoice/InvoiceItem", 0, `FAILED: ${err.message}`);
  }

  // 12. Categorization Rules (depends on User, TransactionCategory)
  try {
    await importCategorizationRules();
  } catch (err: any) {
    logResult("CategorizationRule", 0, `FAILED: ${err.message}`);
  }

  // Reset sequences for autoincrement tables
  try {
    await resetSequences();
  } catch (err: any) {
    console.log(`\n[WARN] Sequence reset failed: ${err.message}`);
  }

  // Print summary
  console.log("\n=== Import Summary ===");
  console.log("-".repeat(50));
  for (const row of summary) {
    const pad = " ".repeat(Math.max(0, 25 - row.table.length));
    console.log(`  ${row.table}${pad} ${row.count.toString().padStart(6)} ${row.status}`);
  }
  console.log("-".repeat(50));
  console.log("\nDone!");
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
