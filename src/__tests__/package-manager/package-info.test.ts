/**
 * @vitest-environment jsdom
 */

import { expect, it } from "vitest";
import { getPackageInfoFromUrl } from "../../package-manager/utils";
import { PackageProvider } from "../../types";

const dummyProvider: PackageProvider = {
   host: "foo.bar",
   postpath: "/to/foo-bar/+esm",
};

const dummyProvider2: PackageProvider = {
   host: "foo.bar",
   handlePackageInfo(url) {
      return {
         name: "foo",
         filename: "bar.js",
         version: "5.5.5",
      };
   },
};

it("simple test", () => {
   expect(
      getPackageInfoFromUrl(
         "https://foo.bar/test/@scope/name@1.0.0/file.js",
         dummyProvider,
         "index.js"
      )
   ).toEqual({
      fullPackageName: "@scope/name@1.0.0",
      fullPath: "@scope/name@1.0.0/file.js",
      scope: "scope",
      name: "name",
      version: "1.0.0",
      filename: "file.js",
   });

   expect(
      getPackageInfoFromUrl(
         "https://foo.bar/test/name@1.0.0/file.js",
         dummyProvider,
         "index.js"
      )
   ).toEqual({
      fullPackageName: "name@1.0.0",
      fullPath: "name@1.0.0/file.js",
      scope: "",
      name: "name",
      version: "1.0.0",
      filename: "file.js",
   });
});

it("should be able to use `handlePackageInfo`", () => {
   expect(
      getPackageInfoFromUrl(
         "https://foo.bar/test/@scope/name@1.0.0/file.js",
         dummyProvider2,
         "index.js"
      )
   ).toEqual({
      fullPackageName: "foo@5.5.5",
      fullPath: "foo@5.5.5/bar.js",
      scope: "",
      name: "foo",
      version: "5.5.5",
      filename: "bar.js",
   });
});

it("should use fallbackFilename", () => {
   expect(
      getPackageInfoFromUrl(
         "https://foo.bar/test/@scope/name@1.0.0",
         dummyProvider,
         "index.js"
      )
   ).toEqual({
      fullPackageName: "@scope/name@1.0.0",
      fullPath: "@scope/name@1.0.0/index.js",
      scope: "scope",
      name: "name",
      version: "1.0.0",
      filename: "index.js",
   });
});

it("should work with postpath", () => {
   expect(
      getPackageInfoFromUrl(
         "https://foo.bar/test/@scope/name@1.0.0/file.js" +
            dummyProvider.postpath,
         dummyProvider,
         "index.js"
      )
   ).toEqual({
      fullPackageName: "@scope/name@1.0.0",
      fullPath: "@scope/name@1.0.0/file.js",
      scope: "scope",
      name: "name",
      version: "1.0.0",
      filename: "file.js",
   });

   expect(
      getPackageInfoFromUrl(
         "https://foo.bar/test/@scope/name@1.0.0" + dummyProvider.postpath,
         dummyProvider,
         "index.js"
      )
   ).toEqual({
      fullPackageName: "@scope/name@1.0.0",
      fullPath: "@scope/name@1.0.0/index.js",
      scope: "scope",
      name: "name",
      version: "1.0.0",
      filename: "index.js",
   });
});

it("should be able to override version", () => {
   expect(
      getPackageInfoFromUrl(
         "https://foo.bar/test/@scope/name@1.0.0/file.js",
         dummyProvider,
         "index.js",
         "1.2.3"
      )
   ).toEqual({
      fullPackageName: "@scope/name@1.2.3",
      fullPath: "@scope/name@1.2.3/file.js",
      scope: "scope",
      name: "name",
      version: "1.2.3",
      filename: "file.js",
   });
});

it("should use fallbackFilename's extension", () => {
   expect(
      getPackageInfoFromUrl(
         "https://foo.bar/test/@scope/name@1.0.0/base",
         dummyProvider,
         "index.css"
      )
   ).toEqual({
      fullPackageName: "@scope/name@1.0.0",
      fullPath: "@scope/name@1.0.0/base.css",
      scope: "scope",
      name: "name",
      version: "1.0.0",
      filename: "base.css",
   });
});