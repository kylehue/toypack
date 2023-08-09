import "bootstrap-icons/font/bootstrap-icons.min.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "./style.css";

Promise.all([import("./main")]).then(() => {
   document.querySelector(".splash-screen")?.classList.add("hidden");
});
