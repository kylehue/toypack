/**
 * @vitest-environment jsdom
 */

import { expect, it } from "vitest";
import { getOptimizedPath } from "../../package-manager/utils";
import { PackageProvider } from "../../types";

const dummyProvider: PackageProvider = {
   host: "foo.bar",
   postpath: "/to/foo-bar/+esm",
   handlePath(moduleInfo) {
      if (moduleInfo.name == "handle-path") {
         return {
            path: "handled-path",
            importPath: "handled-import-path"
          }
       }
   },
};

it("simple test", () => {
   expect(
      getOptimizedPath(
         "bootstrap",
         "5.3.0",
         "https://foo.bar/test/bootstrap@5.3.0/dist/css/bootstrap.min.css/to/foo-bar/+esm",
         "dist/css/bootstrap.min.css",
         "index.css",
         dummyProvider
      )
   ).toEqual({
      path: "/node_modules/bootstrap@5.3.0/dist/css/bootstrap.min.css",
      importPath: "bootstrap@5.3.0/dist/css/bootstrap.min.css",
   });
   expect(
      getOptimizedPath(
         "bootstrap",
         "5.3.0",
         "https://foo.bar/test/bootstrap@5.3.0/dist/css/bootstrap.min.css/to/foo-bar/+esm",
         "dist/css/bootstrap.min.css",
         "index.css",
         dummyProvider,
         "1.0.0"
      )
   ).toEqual({
      path: "/node_modules/bootstrap@1.0.0/dist/css/bootstrap.min.css",
      importPath: "bootstrap@1.0.0/dist/css/bootstrap.min.css",
   });
});

it("should ignore queries", () => {
   expect(
      getOptimizedPath(
         "bootstrap",
         "5.3.0",
         "https://foo.bar/test/bootstrap@5.3.0/dist/css/bootstrap.min.css/to/foo-bar/+esm?dts&target=es2020",
         "dist/css/bootstrap.min.css",
         "index.css",
         dummyProvider
      )
   ).toEqual({
      path: "/node_modules/bootstrap@5.3.0/dist/css/bootstrap.min.css",
      importPath: "bootstrap@5.3.0/dist/css/bootstrap.min.css",
   });
   expect(
      getOptimizedPath(
         "bootstrap",
         "5.3.0",
         "https://foo.bar/test/bootstrap@5.3.0?dts&target=es2020",
         "",
         "index.css",
         dummyProvider
      )
   ).toEqual({
      path: "/node_modules/bootstrap@5.3.0/index.css",
      importPath: "bootstrap@5.3.0/index.css",
   });
});

it("should use extension", () => {
   expect(
      getOptimizedPath(
         "bootstrap",
         "5.3.0",
         "https://foo.bar/test/bootstrap@5.3.0/file/to/foo-bar/+esm",
         "dist/css/bootstrap.min.css",
         "index.css",
         dummyProvider,
         "1.0.0"
      )
   ).toEqual({
      path: "/node_modules/bootstrap@1.0.0/dist/css/file.css",
      importPath: "bootstrap@1.0.0/dist/css/file.css",
   });
});

it("should use fallbackFilename", () => {
   expect(
      getOptimizedPath(
         "bootstrap",
         "5.3.0",
         "https://foo.bar/test/bootstrap@5.3.0/to/foo-bar/+esm",
         "",
         "index.css",
         dummyProvider,
         "1.0.0"
      )
   ).toEqual({
      path: "/node_modules/bootstrap@1.0.0/index.css",
      importPath: "bootstrap@1.0.0/index.css",
   });
});

it("should be able to use `handlePath`", () => {
   expect(
      getOptimizedPath(
         "handle-path",
         "123",
         "asd",
         "asd",
         "asd",
         dummyProvider,
         "123"
      )
   ).toEqual({
      path: "handled-path",
      importPath: "handled-import-path",
   });
});

it("should fallback to url", () => {
   expect(
      getOptimizedPath(
         "name",
         "1.0.0",
         "https://foo.bar/test/hello-there/to/foo-bar/+esm",
         "",
         "",
         dummyProvider,
         ""
      )
   ).toEqual({
      path: "/node_modules/name@1.0.0/test/hello-there/to/foo-bar/+esm",
      importPath: "name@1.0.0/test/hello-there/to/foo-bar/+esm",
   });
});