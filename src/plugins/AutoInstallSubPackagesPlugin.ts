import Toypack from "@toypack/core/Toypack";
import { ToypackPlugin } from "@toypack/core/types";
import { parse as parsePackageName } from "parse-package-name";
import { dirname } from "path-browserify";

export default class AutoInstallSubPackagesPlugin implements ToypackPlugin {
   apply(bundler: Toypack) {
      bundler.hooks.failedResolve(async (descriptor) => {
         const currentDeps = bundler.packageManager.dependencies;
         try {
            const pkg = parsePackageName(descriptor.target);

            // Only auto-install if there's a subpath
            if (pkg.path) {
               let mainPackageVersion = currentDeps[pkg.name];

               // Install if main package is installed
               if (mainPackageVersion) {
                  await bundler.packageManager.install(
                     pkg.name + pkg.path,
                     mainPackageVersion
                  );

                  let newResolved = await bundler.resolve(descriptor.target, {
                     baseDir: dirname(descriptor.parent.source),
                  });

                  descriptor.changeResolved(newResolved);
               }
            }
         } catch (error) {
            console.warn(error);
         }
      });
   }
}
