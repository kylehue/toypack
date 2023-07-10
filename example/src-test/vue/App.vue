<template>
   <h1 class="green">Hello Vue</h1>
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
.green {
   color: rgb(95, 199, 124) !important;
}
</style>
<style src="../styles/sample.css" scoped></style>