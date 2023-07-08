<template>
   <h1 class="green">Hello Vue</h1>
   <button @click="increment">{{ test }}</button>
</template>

<script setup>
import { ref } from "vue";
let test = ref(1);

function increment() {
   test.value += 1;
}

console.log("Hello vue");
</script>

<style lang="scss" scoped>
.green {
   color: rgb(95, 199, 124) !important;
}
</style>
