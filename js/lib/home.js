mixins.home = {
    mounted() {
        let background = this.$refs.homeBackground;
        let images = background.dataset.images.split(",");
        let id = Math.floor(Math.random() * images.length);
        // Keep the embedded preview visible until the full image is ready.
        const image = new Image();
        image.onload = () => { background.style.backgroundImage = `url('${images[id]}')`; };
        image.src = images[id];
        this.menuColor = true;
    },
    methods: {
        homeClick() {
            window.scrollTo({ top: window.innerHeight, behavior: "smooth" });
        },
    },
};
