/**
 * DEMO AJANI — ele geçirilmiş ajan (proje-tanimi.md §10 adım 7).
 *
 * Saldırganın elinde ajanın anahtarı var. Parayı kendi cüzdanına çekmeye
 * çalışır; zincir `PAYEE_NOT_ALLOWED` ile reddeder. Anahtar çalınsa bile fon
 * yalnızca izinli alıcılara gidebilir.
 */
import pc from "picocolors";
import { apiHealth, banner, expectRejection, info, makeAccount, note, step, usdc, API } from "./common.ts";

const health = await apiHealth();
const { account, deployment } = await makeAccount();
banner("REINKEY · ele geçirilmiş ajan", `${API} · zincir modu: ${health?.chainMode ?? "?"}`);

if (health?.chainMode !== "stellar") {
  note("Bu senaryo gerçek zincir gerektirir (backend CHAIN_MODE=stellar).");
  note("Aşağıdaki çağrı yine de testnet'e gider; backend paneli yalnızca mock veri gösterir.");
}

/*
 * Saldırganın cüzdanı zincirde GERÇEKTEN var olmalı ve varlığı kabul
 * edebilmeli. Test USDC'miz klasik bir varlık olduğundan G-hesapları önce
 * trustline açmak zorunda; trustline'ı olmayan bir adrese transfer, politikaya
 * hiç varmadan USDC kontratında düşer (CONTRACT_13) ve "zincir politikayı
 * uyguladı" kanıtı olmaz. Kontrat adresleri (C…) trustline gerektirmez, bu
 * yüzden saldırganın cüzdanı olarak bir kontrat hesabı kullanılır.
 */
const attacker =
  process.env.ATTACKER_ADDRESS ??
  (deployment.demoAccountLegacyId as string | undefined) ??
  deployment.channelContractId;

step("Saldırgan ajanın anahtarını ele geçirdi");
info("ajan anahtarı", `${deployment.agentPublicKey.slice(0, 8)}… ${pc.red("(çalındı)")}`);
info("hesaptaki bakiye", `${usdc(await account.usdcBalance())} USDC`);
info("saldırganın adresi", `${attacker.slice(0, 8)}…`);

step("Denemesi: fonu kendi adresine göndermek");
// Sonda: politikaya uyan küçük bir transfer; başarısız işlemin ayak izi buradan gelir.
const allowedPayee = (await account.getPolicy()).payees[0];
const code = await expectRejection(
  `${usdc(10_000_000n)} USDC transferi → saldırgan`,
  () => account.transfer(attacker, 10_000_000n, { submitOnFailure: true, probeTo: allowedPayee }),
  { account: deployment.demoAccountId },
);

step("Sonuç");
if (code === "PAYEE_NOT_ALLOWED" || code === "PER_TX_CAP_EXCEEDED") {
  console.log(
    `   ${pc.green("✓")} Anahtar çalındı, para çalınamadı. Sınırı sunucu değil ${pc.bold("zincir")} uyguladı.`,
  );
} else {
  console.log(`   ${pc.yellow("!")} Beklenen red kodu gelmedi: ${code ?? "yok"}`);
}
console.log();
