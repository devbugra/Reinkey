"use client";

/**
 * CÜZDAN BAĞLANTISI (Stellar Wallets Kit).
 *
 * Konsol emanetsizdir: bizde hesap, parola ya da anahtar yoktur. Cüzdan iki işe yarar:
 *
 *  1. KİMLİK — adres yazmak yerine cüzdandan okunur. Satıcı için bağlanan adres
 *     doğrudan ödeme adresidir (payTo).
 *  2. İMZA — kullanıcının kendi adına yaptığı zincir işlemleri (havuza yatırma,
 *     çekme) tarayıcıda imzalanır. Anahtar cüzdandan çıkmaz, bize gelmez.
 *
 * Desteklenen: Freighter, xBull, Albedo, Lobstr, Rabet, Hana. Kit ağır ve yalnızca
 * tarayıcıda çalışır; bu yüzden ilk kullanımda dinamik olarak yüklenir.
 */
import { useCallback, useEffect, useState } from "react";
import { t } from "./t";

const KEY = "reinkey.wallet";

type Kit = typeof import("@creit.tech/stellar-wallets-kit").StellarWalletsKit;

let kitPromise: Promise<Kit> | null = null;

async function loadKit(): Promise<Kit> {
  kitPromise ??= (async () => {
    // Modüller alt yollardan gelir; yalnızca desteklenenler paketlenir.
    const [{ StellarWalletsKit, Networks }, freighter, xbull, albedo, lobstr, rabet, hana] = await Promise.all([
      import("@creit.tech/stellar-wallets-kit"),
      import("@creit.tech/stellar-wallets-kit/modules/freighter"),
      import("@creit.tech/stellar-wallets-kit/modules/xbull"),
      import("@creit.tech/stellar-wallets-kit/modules/albedo"),
      import("@creit.tech/stellar-wallets-kit/modules/lobstr"),
      import("@creit.tech/stellar-wallets-kit/modules/rabet"),
      import("@creit.tech/stellar-wallets-kit/modules/hana"),
    ]);
    StellarWalletsKit.init({
      // Testnet: demo ve deploy edilen kontratların ağı.
      network: Networks.TESTNET,
      modules: [
        new freighter.FreighterModule(),
        new xbull.xBullModule(),
        new albedo.AlbedoModule(),
        new lobstr.LobstrModule(),
        new rabet.RabetModule(),
        new hana.HanaModule(),
      ],
      ...(localStorage.getItem(KEY) ? { selectedWalletId: localStorage.getItem(KEY)! } : {}),
    });
    return StellarWalletsKit;
  })();
  return kitPromise;
}

export type WalletState = {
  address: string | null;
  connecting: boolean;
  error: string | null;
};

export function useWallet() {
  const [state, setState] = useState<WalletState>({ address: null, connecting: false, error: null });

  // Daha önce bağlanılmışsa sessizce geri yükle (cüzdan izni hâlâ duruyorsa).
  useEffect(() => {
    let stopped = false;
    const saved = (() => {
      try {
        return localStorage.getItem(KEY);
      } catch {
        return null;
      }
    })();
    if (!saved) return;
    void loadKit()
      .then((kit) => kit.getAddress())
      .then(({ address }) => !stopped && address && setState((s) => ({ ...s, address })))
      .catch(() => undefined);
    return () => {
      stopped = true;
    };
  }, []);

  const connect = useCallback(async (): Promise<string | null> => {
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const kit = await loadKit();
      const { address } = await kit.authModal();
      try {
        localStorage.setItem(KEY, kit.selectedModule.productId);
      } catch {
        /* depolama kapalı: bağlantı yalnızca bu sekmede hatırlanır */
      }
      setState({ address, connecting: false, error: null });
      return address;
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? t()("errors.wallet");
      // Kullanıcı pencereyi kapattıysa hata göstermeye gerek yok.
      setState({ address: null, connecting: false, error: /clos|cancel|reject/i.test(msg) ? null : msg });
      return null;
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* yoksay */
    }
    try {
      const kit = await loadKit();
      await kit.disconnect();
    } catch {
      /* cüzdan zaten kopmuş olabilir */
    }
    setState({ address: null, connecting: false, error: null });
  }, []);

  /** Soroban işlemini cüzdanda imzalatır; imzalı XDR döner. Anahtar tarayıcıdan çıkmaz. */
  const sign = useCallback(async (xdr: string, networkPassphrase: string, address: string): Promise<string> => {
    const kit = await loadKit();
    const { signedTxXdr } = await kit.signTransaction(xdr, { networkPassphrase, address });
    return signedTxXdr;
  }, []);

  return { ...state, connect, disconnect, sign };
}
