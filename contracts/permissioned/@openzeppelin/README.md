# NOTICE

The contracts in this folder were copied over from 

```
"@openzeppelin/contracts-ethereum-package": "2.5.0",
"@openzeppelin/contracts": "2.5.1",
```

The intent is to lock the behavior and memory layout to this version and allow upgrading of the compiler version.  

Simply upgrading the package version may have introduced side-effects that would cause issue with memory layout during upgrading of the logic contracts underlying the proxies.