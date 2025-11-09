// Test case: Direct document.documentElement manipulation should be blocked
function badThemeCode() {
  document.documentElement.classList.add("dark");
}
