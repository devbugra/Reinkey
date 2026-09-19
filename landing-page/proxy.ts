import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * "/" → "/tr" yönlendirmesi ve dil çerezi. Statik dosyalara dokunmaz.
 * `/docs` dışarıda kalır: belgeler tek dildedir ve dil öneki almaz.
 */
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!_next|_vercel|docs|apple-icon|.*\\..*).*)"],
};
