<template>
   <h1 class="green">Hello <span>Vue</span></h1>
   <button @click="increment">{{ counter }}</button>
   <button @click="() => log(counter)">Log</button>
   <VueComponent :msg="'Hello' + counter"></VueComponent>
</template>

<script setup>
import { ref } from "vue";
import VueComponent from "./Comp.vue";
let counter = ref(1);
const log = console.log;
function increment() {
   counter.value += 1;
}

console.log("Hello vue");
</script>

<style lang="scss" scoped>
@import "../styles/mixins.scss";
.green {
   color: rgb(159, 233, 180) !important;

   span {
      color: rgb(18, 170, 99);
      @include black;
   }
}
</style>
<style src="../styles/sample.css" scoped></style>
<style src="../styles/sample.sass" scoped></style>