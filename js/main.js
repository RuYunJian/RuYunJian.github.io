const app = Vue.createApp({
    mixins: Object.values(mixins),
    data() {
        return {
            loading: true,
            introMode: document.body?.dataset.introMode === "home",
            pageLoaded: false,
            pendingEnter: false,
            introStarted: false,
            introMuted: false,
            introAudioPlaying: false,
            introAudioFallback: false,
            introStatus: "点击启动展厅并播放音乐。",
            selectedSchool: null,
            introLyricItems: [],
            introLyricIndex: -1,
            introLyricSerial: 0,
            introLyricTimer: 0,
            introLyricStartAt: 0,
            introLyricsLoop: false,
            introLyrics: [
                { time: 0, text: "入得此门不回首" },
                { time: 5, text: "无需宣之于口" },
                { time: 10, text: "我对案再拜那风雨瓢泼的残陋" },
                { time: 17, text: "再聚首" },
                { time: 21, text: "戏子多秋" },
                { time: 25, text: "可怜一处情深旧" },
                { time: 31, text: "满座衣冠皆老朽" },
                { time: 36, text: "黄泉故事无止休" },
            ],
            ringRotation: 180,
            draggingRing: false,
            dragMoved: false,
            dragStartX: 0,
            lastDragX: 0,
            introRaf: 0,
            introSchools: [
                {
                    name: "清华大学",
                    short: "清华",
                    english: "Tsinghua University",
                    logo: "/images/intro-schools/tsinghua.png",
                    line: "如果高考埋没了你这天才，我再给你一次机会证明自己-----《清华大学计算机系》",
                },
                {
                    name: "北京大学",
                    short: "北大",
                    english: "Peking University",
                    logo: "/images/intro-schools/pku.png",
                    line: "天行健，君子以自强不息；地势坤，君子以厚德载物",
                },
                {
                    name: "复旦大学",
                    short: "复旦",
                    english: "Fudan University",
                    logo: "/images/intro-schools/fudan.png",
                    line: "博学而笃志，切问而近思。",
                },
                {
                    name: "上海交通大学",
                    short: "交大",
                    english: "Shanghai Jiao Tong University",
                    logo: "/images/intro-schools/sjtu.png",
                    line: "饮水思源，爱国荣校。",
                },
                {
                    name: "浙江大学",
                    short: "浙大",
                    english: "Zhejiang University",
                    logo: "/images/intro-schools/zju.png",
                    line: "求是创新。",
                },
                {
                    name: "南京大学",
                    short: "南大",
                    english: "Nanjing University",
                    logo: "/images/intro-schools/nju.png",
                    line: "我们不歧视任何有实力的人，相反，我们只歧视不够用努力的人",
                },
                {
                    name: "中国科学技术大学",
                    short: "中科大",
                    english: "University of Science and Technology of China",
                    logo: "/images/intro-schools/ustc.png",
                    line: "红专并进，理实交融。",
                },
            ],
            hiddenMenu: false,
            showMenuItems: false,
            menuColor: false,
            scrollTop: 0,
            renderers: [],
        };
    },
    computed: {
        activeSchool() {
            if (this.selectedSchool === null) return null;
            return this.introSchools[this.selectedSchool] || null;
        },
    },
    created() {
        window.addEventListener("load", () => {
            this.pageLoaded = true;
            if (!this.introMode) {
                this.loading = false;
                return;
            }
            this.introStatus = this.introStarted
                ? "主页已经就绪，可以继续探索或进入主页。"
                : "主页已经就绪。";
            if (this.pendingEnter) this.finishIntro();
        });
    },
    mounted() {
        window.addEventListener("scroll", this.handleScroll, true);
        this.render();
        this.startIntroSpin();
    },
    methods: {
        render() {
            for (let i of this.renderers) i();
        },
        startIntro() {
            this.playIntroAudio();
            this.introStarted = true;
            this.introStatus = this.pageLoaded
                ? "拖动校徽环，点击校徽查看留言。"
                : "主页仍在加载，展厅已先启动。";
        },
        playIntroAudio() {
            const audio = document.querySelector("#loading audio");
            if (!audio) return;
            if (typeof audio.play !== "function") {
                this.introStatus = "浏览器没有开放音频播放接口，请刷新后再试。";
                return;
            }
            audio.volume = 0.6;
            audio.muted = false;
            this.introMuted = false;
            try {
                audio.currentTime = 0;
                const play = audio.play();
                if (play && typeof play.catch === "function") {
                    play.catch(() => {
                        this.introAudioPlaying = false;
                        this.introAudioFallback = true;
                        this.introStatus = "音乐被浏览器拦截，请点左上角播放按钮。";
                    });
                }
                this.introAudioPlaying = true;
                this.introAudioFallback = false;
            } catch (error) {
                this.introAudioPlaying = false;
                this.introAudioFallback = true;
                if (!this.introStatus.includes("主页仍在加载")) {
                    this.introStatus = "音乐被浏览器拦截，请点左上角播放按钮。";
                }
            }
        },
        toggleIntroAudio() {
            const audio = document.querySelector("#loading audio");
            if (!audio) return;
            if (!audio.paused) {
                audio.pause();
                this.introAudioPlaying = false;
                this.introStatus = "音乐已暂停。";
                return;
            }
            audio.volume = 0.6;
            audio.muted = false;
            this.introMuted = false;
            const play = audio.play();
            if (play && typeof play.then === "function") {
                play.then(() => {
                    this.introAudioPlaying = true;
                    this.introAudioFallback = false;
                    this.introStatus = this.introStarted
                        ? "拖动校徽环，点击校徽查看留言。"
                        : "音乐已播放，点击启动展厅继续。";
                }).catch(() => {
                    this.introAudioPlaying = false;
                    this.introAudioFallback = true;
                    this.introStatus = "音乐仍被浏览器拦截，请再点一次播放按钮。";
                });
            } else {
                this.introAudioPlaying = true;
                this.introAudioFallback = false;
            }
        },
        enterSite() {
            if (!this.pageLoaded) {
                this.pendingEnter = true;
                this.introStatus = "主页还在加载，加载完成后自动进入。";
                return;
            }
            this.finishIntro();
        },
        finishIntro() {
            const audio = document.querySelector("#loading audio");
            if (audio) audio.pause();
            this.introAudioPlaying = false;
            this.introAudioFallback = false;
            this.stopIntroLyrics();
            this.loading = false;
            this.pendingEnter = false;
            this.selectedSchool = null;
        },
        startIntroLyrics() {
            this.stopIntroLyrics();
            const layer = this.$el.querySelector(".intro-lyrics");
            if (layer) layer.innerHTML = "";
            this.introLyricItems = [];
            this.introLyricIndex = -1;
            this.introLyricSerial = 0;
            this.introLyricStartAt = Date.now();
            this.syncIntroLyrics();
            this.introLyricTimer = window.setInterval(() => this.syncIntroLyrics(), 240);
        },
        stopIntroLyrics() {
            if (this.introLyricTimer) {
                window.clearInterval(this.introLyricTimer);
                this.introLyricTimer = 0;
            }
            const layer = this.$el.querySelector(".intro-lyrics");
            if (layer) layer.innerHTML = "";
        },
        syncIntroLyrics() {
            if (!this.loading || !this.introStarted || !this.introLyrics.length) return;
            const audio = this.$refs.introAudio;
            if (!audio || audio.paused) return;
            let seconds = audio.currentTime || 0;
            const lastLyric = this.introLyrics[this.introLyrics.length - 1];
            const loopDuration = lastLyric.time + 4;
            if (this.introLyricsLoop && loopDuration > 0) seconds %= loopDuration;

            let nextIndex = -1;
            for (let i = 0; i < this.introLyrics.length; i++) {
                if (seconds >= this.introLyrics[i].time) nextIndex = i;
                else break;
            }
            if (nextIndex === -1 || nextIndex === this.introLyricIndex) return;

            this.introLyricIndex = nextIndex;
            const item = {
                id: ++this.introLyricSerial,
                text: this.introLyrics[nextIndex].text,
            };
            this.renderIntroLyric(item);
            this.introLyricItems.push(item);
            if (this.introLyricItems.length > 4) this.introLyricItems.shift();
            window.setTimeout(() => {
                this.introLyricItems = this.introLyricItems.filter((lyric) => lyric.id !== item.id);
            }, 3600);
        },
        renderIntroLyric(item) {
            const layer = this.$el.querySelector(".intro-lyrics");
            if (!layer) return;
            const lyric = document.createElement("li");
            lyric.className = "intro-lyric-item";
            lyric.textContent = item.text;
            layer.appendChild(lyric);
            window.setTimeout(() => {
                lyric.remove();
            }, 3600);
        },
        getSchoolPanelStyle(index) {
            const angle = index * (-360 / this.introSchools.length);
            return {
                transform: `translate(-50%, -50%) rotateY(${angle}deg) translateZ(var(--intro-radius))`,
            };
        },
        openSchool(index) {
            if (this.dragMoved) {
                this.dragMoved = false;
                return;
            }
            this.selectedSchool = index;
        },
        closeSchool() {
            this.selectedSchool = null;
        },
        getPointerX(e) {
            if (e.touches && e.touches[0]) return e.touches[0].clientX;
            if (typeof e.clientX === "number") return e.clientX;
            return null;
        },
        introPointerDown(e) {
            if (!this.introStarted || this.selectedSchool !== null) return;
            const x = this.getPointerX(e);
            if (x === null) return;
            this.draggingRing = true;
            this.dragMoved = false;
            this.dragStartX = x;
            this.lastDragX = x;
            window.addEventListener("pointermove", this.introPointerMove);
            window.addEventListener("pointerup", this.introPointerUp, { once: true });
            window.addEventListener("pointercancel", this.introPointerUp, { once: true });
        },
        introPointerMove(e) {
            if (!this.draggingRing) return;
            const x = this.getPointerX(e);
            if (x === null) return;
            const delta = x - this.lastDragX;
            if (Math.abs(x - this.dragStartX) > 6) this.dragMoved = true;
            this.ringRotation += delta * 0.35;
            this.lastDragX = x;
        },
        introPointerUp() {
            this.draggingRing = false;
            window.removeEventListener("pointermove", this.introPointerMove);
        },
        startIntroSpin() {
            const spin = () => {
                if (
                    this.loading &&
                    this.introMode &&
                    this.introStarted &&
                    !this.draggingRing &&
                    this.selectedSchool === null
                ) {
                    this.ringRotation += 0.055;
                }
                this.introRaf = window.requestAnimationFrame(spin);
            };
            this.introRaf = window.requestAnimationFrame(spin);
        },
        handleScroll() {
            let wrap = this.$refs.homePostsWrap;
            let newScrollTop = document.documentElement.scrollTop;
            if (this.scrollTop < newScrollTop) {
                this.hiddenMenu = true;
                this.showMenuItems = false;
            } else this.hiddenMenu = false;
            if (wrap) {
                if (newScrollTop <= window.innerHeight - 100) this.menuColor = true;
                else this.menuColor = false;
                if (newScrollTop <= 400) wrap.style.top = "-" + newScrollTop / 5 + "px";
                else wrap.style.top = "-80px";
            }
            this.scrollTop = newScrollTop;
        },
    },
});
app.mount("#layout");

(() => {
    const lyrics = [
        { time: 0, text: "入得此门不回首" },
        { time: 5, text: "无需宣之于口" },
        { time: 10, text: "我对案再拜那风雨瓢泼的残陋" },
        { time: 17, text: "再聚首" },
        { time: 21, text: "戏子多秋" },
        { time: 25, text: "可怜一处情深旧" },
        { time: 31, text: "满座衣冠皆老朽" },
        { time: 36, text: "黄泉故事无止休" },
    ];
    let timer = 0;
    let index = -1;

    const getLoading = () => document.querySelector("#loading");

    const getAudio = () => getLoading()?.querySelector("audio");

    const introIsVisible = () => {
        const loading = getLoading();
        return loading && getComputedStyle(loading).display !== "none";
    };

    const clearTimer = () => {
        if (!timer) return;
        window.clearInterval(timer);
        timer = 0;
    };

    const clearLyrics = () => {
        const layer = document.querySelector(".intro-lyrics");
        if (layer) layer.innerHTML = "";
    };

    const stopLyrics = () => {
        clearTimer();
        index = -1;
        clearLyrics();
    };

    const addLyric = (text) => {
        const layer = document.querySelector(".intro-lyrics");
        if (!layer) return;
        const item = document.createElement("li");
        item.className = "intro-lyric-item";
        item.textContent = text;
        layer.appendChild(item);
        window.setTimeout(() => item.remove(), 3600);
    };

    const getLyricIndex = (seconds) => {
        let nextIndex = -1;
        for (let i = 0; i < lyrics.length; i++) {
            if (seconds >= lyrics[i].time) nextIndex = i;
            else break;
        }
        return nextIndex;
    };

    const syncLyrics = () => {
        if (!introIsVisible()) {
            stopLyrics();
            return;
        }
        const audio = getAudio();
        if (!audio) return;
        if (audio.paused) {
            if ((audio.currentTime || 0) < 0.1 && index === -1) showPreviewLyric();
            return;
        }
        const nextIndex = getLyricIndex(audio.currentTime || 0);
        if (nextIndex === -1 || nextIndex === index) return;
        index = nextIndex;
        addLyric(lyrics[index].text);
    };

    const startLyrics = () => {
        clearTimer();
        clearLyrics();
        index = -1;
        syncLyrics();
        timer = window.setInterval(syncLyrics, 160);
    };

    const showPreviewLyric = () => {
        clearTimer();
        clearLyrics();
        index = -1;
        addLyric(lyrics[0].text);
        timer = window.setInterval(() => {
            const audio = getAudio();
            if (audio && !audio.paused) {
                startLyrics();
                return;
            }
            addLyric(lyrics[0].text);
        }, 5200);
    };

    const revealSite = () => {
        const audio = getAudio();
        if (audio) audio.pause();
        stopLyrics();

        const loading = getLoading();
        if (loading) {
            loading.setAttribute("aria-hidden", "true");
            loading.style.display = "none";
            loading.style.pointerEvents = "none";
        }

        const main = document.querySelector("#main");
        if (main) {
            main.classList.remove("into-enter-from");
            main.classList.add("into-enter-active");
            main.style.opacity = "1";
            main.style.transform = "none";
        }
        document.body.classList.add("intro-finished");
    };

    const attachAudioSync = () => {
        const audio = getAudio();
        if (!audio || audio.dataset.lyricSyncAttached) return;
        audio.dataset.lyricSyncAttached = "true";
        audio.addEventListener("playing", startLyrics);
        audio.addEventListener("timeupdate", syncLyrics);
        audio.addEventListener("seeked", () => {
            index = -1;
            clearLyrics();
            syncLyrics();
        });
        audio.addEventListener("pause", () => {
            clearTimer();
            if ((audio.currentTime || 0) < 0.1 && introIsVisible()) showPreviewLyric();
        });
        audio.addEventListener("ended", revealSite);
    };

    document.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        const text = button.textContent.trim();
        if (text === "进入主页" || text === "直接进入") revealSite();
    }, true);

    window.addEventListener("load", () => {
        if (!document.querySelector(".intro-loading")) return;
        attachAudioSync();
        showPreviewLyric();
    });
})();
