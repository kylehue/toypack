import { Drawer, File } from "@kylehue/drawer";
import Toypack from "toypack";
import { Asset } from "toypack/types";
import * as monaco from "monaco-editor";
import { getLang, switchModelToNewUri } from "./utils";
import path from "path-browserify";

const videoExtensions = /\.(mp4|webp|avi)$/;
const imageExtensions = /\.(jpe?g|gif|png)$/;

export class FileManager {
   private _stored = new Map<
      string,
      {
         bundlerAsset: Asset;
         drawerFile: File;
         monacoModel?: monaco.editor.ITextModel;
      }
   >();
   constructor(
      private _editor: monaco.editor.IStandaloneCodeEditor,
      private _drawer: Drawer,
      private _bundler: Toypack
   ) {
      const monacoPreview = document.querySelector(".container-monaco")!;
      const imagePreview = document.querySelector(".container-preview-image")!;
      const videoPreview = document.querySelector(".container-preview-video")!;
      _drawer.onDidClickItem(({ item, event }) => {
         if (event.ctrlKey) {
            if (item.type === "file") {
               this.removeFile(item.source);
            } else {
               this.removeDirectory(item.source);
            }
         }

         if (item.type != "file") return;
         const clickedItem = this._stored.get(item.source);
         if (clickedItem?.monacoModel) {
            this._editor.setModel(clickedItem.monacoModel);
            this._editor.focus();
         }

         const asset = _bundler.getAsset(item.source);
         if (asset?.type == "resource" && imageExtensions.test(asset.source)) {
            monacoPreview.classList.add("d-none");
            imagePreview.classList.remove("d-none");
            videoPreview.classList.add("d-none");
            const el = imagePreview.querySelector("img")!;
            el.setAttribute("src", asset.contentURL);
         } else if (
            asset?.type == "resource" &&
            videoExtensions.test(asset.source)
         ) {
            monacoPreview.classList.add("d-none");
            imagePreview.classList.add("d-none");
            videoPreview.classList.remove("d-none");
            const el = videoPreview.querySelector("video")!;
            el.setAttribute("src", asset.contentURL);
         } else {
            monacoPreview.classList.remove("d-none");
            imagePreview.classList.add("d-none");
            videoPreview.classList.add("d-none");
         }
      });

      _drawer.onDidRenameItem((event) => {
         if (event.item.type == "file") {
            this.renameFile(event.oldSource, event.newSource);
         } else {
            this.renameDirectory(event.oldSource, event.newSource);
         }
      });

      _drawer.onDidMoveItem((event) => {
         if (event.item.type == "file") {
            this.renameFile(event.oldSource, event.newSource);
         } else {
            this.renameDirectory(event.oldSource, event.newSource);
         }
      });

      _drawer.onDidDeleteItem((event) => {
         if (event.item.type == "file") {
            this.removeFile(event.item.source);
         } else {
            this.removeDirectory(event.item.source);
         }
      });

      _editor.onDidChangeModelContent(() => {
         const model = _editor.getModel();
         if (!model) return;
         const value = model.getValue();
         _bundler.addOrUpdateAsset(model.uri.path, value);
         window.localStorage.setItem(model.uri.path, value);
      });
   }

   private _maybeCreateModel(source: string, content?: any) {
      if (typeof content != "string") return;
      const uri = monaco.Uri.parse(source);
      if (monaco.editor.getModel(uri)) return;
      const model = monaco.editor.createModel(content, getLang(uri.path), uri);

      return model;
   }

   renameFile(oldSource: string, newSource: string) {
      oldSource = path.join("/", oldSource);
      newSource = path.join("/", newSource);
      const stored = this._stored.get(oldSource);
      if (!stored) return;

      // drawer
      stored.drawerFile.move(newSource);

      // model
      if (stored.monacoModel) {
         const newUri = monaco.Uri.parse(newSource);
         const newModel = switchModelToNewUri(stored.monacoModel, newUri);
         this._editor.setModel(newModel);
         this._editor.focus();
         stored.monacoModel = newModel;
      }

      // bundler
      const newAsset = this._bundler.moveAsset(oldSource, newSource);
      if (newAsset) {
         stored.bundlerAsset = newAsset;
      }

      this._stored.set(newSource, stored);
      this._stored.delete(oldSource);

      window.localStorage.removeItem(oldSource);
      if (typeof stored.bundlerAsset.content === "string") {
         window.localStorage.setItem(newSource, stored.bundlerAsset.content);
      }
   }

   renameDirectory(oldSource: string, newSource: string) {
      oldSource = path.join("/", oldSource);
      newSource = path.join("/", newSource);
      const assets = this._bundler.moveDirectory(oldSource, newSource);
      for (const { oldSource, asset } of assets) {
         this.renameFile(oldSource, asset.source);
      }
   }

   removeFile(source: string) {
      source = path.join("/", source);
      const stored = this._stored.get(source);
      if (!stored) return;
      stored.drawerFile.delete();
      this._bundler.removeAsset(source);
      stored.monacoModel?.dispose();
      this._stored.delete(source);
      window.localStorage.removeItem(source);
   }

   removeDirectory(source: string) {
      source = path.join("/", source);
      const assets = this._bundler.removeDirectory(source);
      for (const asset of assets) {
         this.removeFile(asset.source);
      }
      this._drawer.root.delete(source);
   }

   addFile(source: string, content?: string | Blob) {
      source = path.join("/", source);
      const drawerFile = this._drawer.root.add(source, "file");
      const bundlerAsset = this._bundler.addOrUpdateAsset(source, content);
      drawerFile.widget.focus();
      const monacoModel = this._maybeCreateModel(source, content);
      this._stored.set(source, {
         bundlerAsset,
         drawerFile,
         monacoModel,
      });
      if (monacoModel) {
         this._editor.setModel(monacoModel);
         this._editor.focus();
      }
      if (typeof content == "string") {
         window.localStorage.setItem(source, content);
      }
   }
}
