<script setup>
// @ts-nocheck
import { ref } from "vue";
const props = defineProps({
   msg: String
});

const msg = ref(props.msg);

</script>

<template>
   <h1>{{ msg }}</h1>
   <input v-model="msg" />
</template>
