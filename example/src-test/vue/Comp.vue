<script setup lang="ts">
// @ts-nocheck
import { ref } from "vue";
const props = defineProps<{
   msg: string;
}>();

const msg = ref(props.msg);

</script>

<template>
   <h1>{{ msg }}</h1>
   <input v-model="msg" />
</template>
