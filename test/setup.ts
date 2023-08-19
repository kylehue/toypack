/**
 * @vitest-environment jsdom
 */

import { vi } from "vitest";
import createFetchMock from "vitest-fetch-mock";
const fetchMocker = createFetchMock(vi);
fetchMocker.dontMock();
class MockURL {
   public origin: string = "";
   public host: string = "";
   public protocol: string = "";
   constructor(url: string) {
      var pathArray = url.split("/");
      this.protocol = pathArray[0];
      this.host = pathArray[2];
      this.origin = this.protocol + "//" + this.host;
   }

   static createObjectURL() {
      return "url";
   }

   static revokeObjectURL() {}
}

vi.stubGlobal("URL", MockURL);
