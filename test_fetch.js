async function test() {
  const res = await fetch('http://localhost:3000/api/storage/objects');
  console.log(res.status);
  console.log(await res.text());
}
test();
