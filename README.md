# Audio Ray-Tracing in the Browser with WebGPU

_Acoustics and Music Technology final year project._

## Running the code

[nix](https://nixos.org/) is used to manage dependencies. On Windows you'll have to use WSL. Alternatively, manually install the dependencies listed in `shell.nix`.

```sh
> nix-shell # enter the Nix environment, if you're using Nix.
> npm install # install dependencies.
```

You can run the following commands in the Nix shell:

```sh
> npm run serve # run the server locally.
> npm run build # build the src/ directory and put it in public/.
> npm run build-watch # rebuild whenever a file is changed.
> npm run typecheck # typecheck.
> npm run typecheck-watch # typecheck whenever a file is changed.
> npm run format # format the code.
```
