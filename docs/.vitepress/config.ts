import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
   title: "Toypack",
   description: "The sandbox bundler for static sites.",
   themeConfig: {
      // https://vitepress.dev/reference/default-theme-config
      nav: [
         { text: "Home", link: "/" },
         { text: "Guide", link: "/getting-started" },
      ],

      sidebar: [
         {
            text: "Getting started",
            items: [{ text: "Installation", link: "/getting-started" }],
         },
         {
            text: "Reference",
            items: [{ text: "API Examples", link: "/api-examples" }],
         },
      ],

      socialLinks: [
         { icon: "github", link: "https://github.com/kylehue/toypack" },
      ],

      search: {
         provider: "local",
      },
   },
});
