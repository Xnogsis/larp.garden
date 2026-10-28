# Tv sources

The registry in `tv-sources.js` covers every unique website in the
[API / Embedding Sites list](https://rentry.co/onbksdgu#api-embedding-sites),
including its alternate domains. Repeated links to 2embed.skin and vsembed.ru
appear once. Social, status, self-hosted API, and unrelated catalog links are
not player sources.

Movie and TV routes use numeric TMDB IDs. Anime-only providers use the ID system
shown below. An anime adaptation can also be found through TMDB and played as a
TV show on a movie/TV provider. Documented routes establish integration formats,
not current stream availability. No provider promises or uptime claims are made.

## References checked

| Source | Reference and route differences |
| --- | --- |
| 0VIDADS, VidStuck, ZXCSTREAM | https://0vidads.top/documentation; existing user-supplied `/embed/movie/{id}` and `/embed/tv/{id}/{season}/{episode}` examples, branding options retained. Alternate websites serve the same provider interface. |
| 2embed, 2embed.skin | https://2embed.skin/ documents `www.2embed.cc/embed/{id}` and `/embedtv/{id}&s={season}&e={episode}` (literal ampersands in the path). Direct access to www.2embed.cc returned proxy 403; formats read from its listed alternate. |
| 2embed.stream | https://2embed.stream/ → TMDB ID → API reference; `/embed/movie/{id}` and `/embed/tv/{id}/{season}/{episode}`. |
| animeTVplus Embed | https://embed.animetvplus.site/; `/{MAL_ID}/{episode}`. MyAnimeList IDs, not TMDB. |
| Atlantic API | http://embed.atlantic.st/ public client docs; HTTPS player on `atlantic.st/embed/movie/...` and `/embed/tv/...`. |
| Cinemaos | https://cinemaos.tech/embed; `/player/{id}` and `/player/{id}/{season}/{episode}`. |
| CineSRC | https://cinesrc.st/docs; TV uses `/embed/tv/{id}?s={season}&e={episode}`. |
| Cinextream API | https://cinextream.cc/; `/api/embed/movie/...`, `/api/embed/tv/...`. |
| Cinezo API | https://cinezo.live/; player uses `player.cinezo.live/embed/movie/...` and `/embed/tv/...`. |
| Fmov | https://fmov.my/ public embed generator and client routes; `/embed/movie/...` and `/embed/tv/...`. |
| frameXTV | https://framextv.xyz/api redirects to https://framextv.cc/api; public client routes include `/embed/movie/{tmdbId}` and `/embed/tv/{tmdbId}/{season}/{episode}`. |
| Mapple Player | https://mappletv.uk/; player uses `mapple.fun/watch/movie/{id}` and `/watch/tv/{id}-{season}-{episode}`. |
| Nxsha Embed | https://web.nxsha.app/embed; public embed generator uses `/embed/movie/...` and `/embed/tv/...`. |
| NontonGo | https://nontongo.win/ TMDB API docs; `/embed/movie/...`, `/embed/tv/...`. |
| PrimeSRC | https://primesrc.me/ public API docs; `/embed/movie?tmdb={id}`, `/embed/tv?tmdb={id}&season={season}&episode={episode}`. |
| SuperEmbed | https://www.superembed.stream/; `multiembed.mov/?video_id={id}&tmdb=1`, TV adds `&s=...&e=...`. No PHP backend is needed for this documented basic iframe route. |
| Stellar API | https://stellar.rip/en/api; `/en/watch/embed/movie/{id}`, `/en/watch/embed/tv/{id}-{season}-{episode}`. |
| TryEmbed | https://tryembed.us.cc/ currently documents anime via `/embed/anime/{AniList_ID}/{episode}/sub`; configured for that documented capability even though the index advertises movies/TV too. |
| Velarium | https://velarium.cc/en/docs/endpoints; `/en/watch/movie/{id}`, `/en/watch/tv/{id}-{season}-{episode}`. |
| VidAPI.ru | https://vidapi.ru/api; player on `vaplayer.ru/embed/movie/...` and `/embed/tv/...`. |
| Viduki | https://www.viduki.net/; four APIs documented. Default multi-server API 1 uses `viduki.net/1/movie/{id}` and `/1/tv/{id}/{season}/{episode}`. |
| VidCore | https://vidcore.net/ public docs; player URLs explicitly use `vidcore.io/movie/...` and `/tv/...`. |
| VidCore.org | https://www.vidcore.org/; `vidcore.org/embed/movie/...` and `/embed/tv/...`. |
| VidFast and six alternate domains | https://vidfast.vc/ public docs; `/movie/...`, `/tv/...`. xyz, pm, net, io, and in redirected to vc during inspection; me was not independently verified. Separate entries retain each listed domain and provider route. |
| VidFlix | https://vidflix.club/ public `/docs` client; `/movie/...`, `/tv/...`. |
| VidLink | https://vidlink.pro/; `/movie/...`, `/tv/...`. |
| VidHawk | https://vidhawk.buzz/; `/embed/ani/{AniList_ID}/{episode}/sub`. |
| VidNest | https://vidnest.fun/; `/movie/...`, `/tv/...`. |
| vidrock | https://vidrock.net/ public docs; `/movie/...`, `/tv/...`. |
| VidRift | https://vidrift.net/docs; player at `embed.vidrift.net/embed/movie/...` and `/embed/tv/...`. Docs require a referrer; iframe uses `strict-origin-when-cross-origin`. |
| VixSrc | https://vixsrc.to/; `/movie/...`, `/tv/...`. |
| VidSrc.sh and alternate domains | https://vidsrc.sh/vidsrc/docs; `/embed/movie/...`, `/embed/tv/...`. vidsrc2.ru and vidsrc.ir serve the same documentation. vsembed.ru and vsembed.su returned 403; the main provider documents support for older domains. |
| VidSrc.to | https://vidsrc.to/ API section; `/embed/movie/...`, `/embed/tv/...`. |
| VidUP | https://vidup.to/ public docs; `/movie/...`, `/tv/...`. |
| Vidy | https://www.vidy.st/; documented player on `vidy.st/movie/...` and `/tv/...`. |
| Vidzen | https://vidzen.fun/; `/movie/...`, `/tv/...`. |

## Website-only entries

These stay in the selector with an explanation and working website link. Loading
is disabled; no speculative iframe URL is generated.

| Source | Evidence and prerequisite |
| --- | --- |
| Vidzee | https://vidzee.wtf/ repeatedly returned HTTP 522. Need restored service and readable embed documentation. |
| Vyla | https://vyla.cc/products/player.md and https://vyla.cc/stream-api/overview/index.md document an SDK or self-hosted Node HTTP/SSE service, not a public iframe endpoint. Requires a separately hosted backend/player and TMDB credentials. |
| ZoryvaX API | https://zoryva.me/embed and www alternate returned HTTP 403. Need a readable embed reference or confirmed movie/TV examples. |

Browser tests mock external frames to verify our source selection, URL building,
ID boundaries, and layout without depending on third-party streams. They do not
verify successful playback on each provider. Provider scripts execute only inside
their own cross-origin frames, never as scripts on this site's origin.
