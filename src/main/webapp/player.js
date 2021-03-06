/* This file is part of Wissl - Copyright (C) 2013 Mathieu Schnoor
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/*global $, wsl, soundManager, document */

var player = {};

(function (player) {
	'use strict';

	// set to true when soundmanager loads
	player.hasSound = false;
	// currently playing sound
	player.sound = null;

	// preload for next sound in playlist
	player.nextSound = null;

	player.playing = null;

	player.nextPlaying = null;

	player.volume = 100;

	player.muted = false;

	player.init = function (useHtml) {
		var reboot = player.hasSound;

		if (reboot) {
			player.stop();
		}

		soundManager.setup({
			url : "static/soundmanager-swf",
			flashVersion : 9,
			preferFlash : true,

			useHTML5Audio : useHtml,
			debugMode : true,
			consoleOnly : true,

			onready : function () {
				'use strict';
				player.hasSound = true;
			},
			ontimeout : function () {
				'use strict';
				wsl.errorPopup("Failed to start soundmanager2");
			}
		});

		if (reboot) {
			soundManager.reboot();
		}
	};

	player.play = function (playing) {
		if (!playing) {
			return;
		}
		if (player.nextSound !== null) {
			player.nextSound.destruct();
			player.nextSound = null;
			player.nextPlaying = null;
		}

		if (player.playing && player.playing.playlist_id !== playing.playlist_id) {
			var msg = 'A song is currently playing from another playlist.<br>Continue?';
			wsl.confirmDialog('New playlist', msg, function () {
				player.internalPlay(playing);
			}, function () {
			});
		} else {
			player.internalPlay(playing);
		}
	};

	player.internalPlay = function (playing) {
		player.playing = playing;

		$.ajax({
			url : "wissl/song/" + playing.song_id,
			headers : {
				"sessionId" : wsl.sessionId
			},
			dataType : "json",
			success : function (data) {
				var song, artist, album, art;
				song = data.song;
				artist = data.artist;
				album = data.album;

				player.destroySound();
				player.song = song;
				player.playing = playing;
				player.playing.album_id = album.id;
				player.playing.artist_id = artist.id;

				$('.playing').removeClass('playing');
				$('#play').addClass('pause');
				$('#player').fadeIn(300);
				$('#navbar-playing').show();

				$('#playing-title').html('<a title="' + song.title + '">' + song.title + '</a>');
				$('#playing-album').empty().html('on <a title="' + album.name + '" onclick="wsl.load(\'?songs/' + album.id + '\')" class="playing-album">' + (album.name || ' ') + '</a>');
				$('#playing-artist').empty().html('by <a title="' + artist.name + '" onclick="wsl.load(\'?albums/' + artist.id + '\')" class="playing-artist">' + (artist.name || ' ') + '</a>');

				$('#playing').show();

				if (album.artwork) {
					art = '<img src="wissl/art/' + album.id + '?' + album.artwork_id + '" />';
				} else {
					art = '<img src="img/no-artwork.jpg" />';
				}
				$('#art').empty().html(art);

				if (song.title && song.title !== '') {
					document.title = song.title;
				} else {
					document.title = 'Wissl';
				}

				if (playing) {
					$('#playlist-' + playing.playlist_id + '-' + playing.position).addClass('playing');
					$('#song-' + song.id).addClass('playing');
					$('#album-' + album.id).addClass('playing');
					$('#artist-' + artist.id).addClass('playing');
				}

				if (!player.hasSound) {
					wsl.errorPopup("Cannot play " + song.title + ": no sound");
					return;
				}
				if (player.nextSound === null) {
					player.sound = player.createSound(data);
				} else {
					player.sound = player.nextSound;
					player.nextSound = null;
					player.nextPlaying = null;
				}
				player.sound.play();
			},
			error : function (xhr) {
				wsl.ajaxError("failed to get song " + playing.song_id, xhr);
			}
		});
	};

	player.createSound = function (data) {
		var movieStar, baseUrl;

		movieStar = (data.song.format === 'audio/aac');
		baseUrl = (movieStar ? wsl.baseUrl() : '');

		return soundManager.createSound({
			id : "song_" + data.song.id,
			url : baseUrl + "wissl/song/" + data.song.id + "/stream?sessionId=" + wsl.sessionId,
			autoPlay : false,
			autoLoad : true,
			multiShot : false,
			isMovieStar : movieStar,
			type : data.song.format,
			onfinish : function () {
				player.next();
			},
			onplay : function () {
				if (this.loaded) {
					this._iO.onload();
				}
			},
			onload : function () {
				if (player.nextSound === null) {

					var p = player.playing;
					$.ajax({
						url : "wissl/playlist/" + p.playlist_id + "/song/" + (p.position + 1),
						headers : {
							"sessionId" : wsl.sessionId
						},
						dataType : "json",
						success : function (data) {
							if (data.song && data.song.id) {
								player.nextPlaying = {
									song_id : data.song.id,
									playlist_id : p.playlist_id,
									playlist_name : p.playlist_name,
									position : p.position + 1
								};
								player.nextSound = player.createSound(data);
							}
						},
						error : function (xhr) {
							if (xhr.status !== 404) {
								wsl.ajaxError("Failed to get next song in playlist", xhr);
							}
						}
					});

				}
			},
			whileplaying : function () {
				var width, w1, w2, d1, d2, t, kbps, vol;

				if (player.sound.muted !== player.mute) {
					if (player.mute) {
						player.sound.mute();
					} else {
						player.sound.unmute();
					}
				}
				$('#volume-slider-full').height(player.volume * $('#volume-slider').height() / 100);
				player.sound.setVolume(Math.pow(player.volume / 100, 3) * 100);
				vol = $('#volume-icon');
				vol.removeClass();
				if (player.mute) {
					vol.addClass('volume-mute');
				} else {
					if (player.volume > 75) {
						vol.addClass('volume-high');
					} else if (player.volume > 50) {
						vol.addClass('volume-medium');
					} else if (player.volume > 25) {
						vol.addClass('volume-low');
					} else {
						vol.addClass('volume-zero');
					}
				}

				player.song.duration = player.sound.durationEstimate / 1000;
				width = $("#progress").width();
				w1 = (player.sound.position / (player.song.duration * 1000)) * width;
				w2 = (player.sound.bytesLoaded / player.sound.bytesTotal) * width;
				d1 = wsl.formatSeconds(player.sound.position / 1000);
				d2 = wsl.formatSeconds(player.song.duration);
				$("#progress-played").width(w1);
				$("#progress-download").width(w2);
				$("#position").html('<strong>' + d1 + "</strong> / " + d2);

				if (player.sound.bytesLoaded !== player.sound.bytesTotal) {
					t = new Date().getTime();
					if (!player.sound.t) {
						player.sound.t = t;
						player.sound.bytesAtT = player.sound.bytesLoaded;
					}
					if (t - player.sound.t > 1000) {
						kbps = Math.ceil((player.sound.bytesLoaded - player.sound.bytesAtT) / 1024);
						$('#download-rate').empty().html(kbps + 'Kbps').show();
						player.sound.t = t;
						player.sound.bytesAtT = player.sound.bytesLoaded;
					}
				} else {
					$('#download-rate').hide();
				}
			}
		});
	};

	player.togglePlay = function () {
		if (player.sound) {
			player.sound.togglePause();
			if (player.sound.paused) {
				$('#play').removeClass('pause');
			} else {
				$('#play').addClass('pause');
			}
		}
	};

	player.showSeek = function (event) {
		if (player.sound) {
			var progress, x, w, time, elt;
			progress = $("#progress");
			x = event.clientX - progress.offset().left;
			w = progress.width();
			time = wsl.formatSeconds((x / w) * player.song.duration);
			elt = $('#seek-popup');
			elt.html(time).show();
			elt.css('left', event.clientX);
		}
	};

	player.hideSeek = function () {
		$('#seek-popup').hide();
	};

	player.seek = function (event) {
		if (player.sound) {
			var x, w;
			x = event.clientX - $("#progress").offset().left;
			w = $("#progress").width();
			player.sound.setPosition((x / w) * player.song.duration * 1000);
		}
	};

	player.destroySound = function () {
		if (player.sound) {
			player.sound.destruct();
			player.sound = null;
		}
		if (player.playing) {
			player.playing = null;
		}
	};

	player.stop = function () {
		if (player.sound) {
			$('#player').fadeOut(300);
			player.destroySound();
			$('#play').removeClass('pause');
			$("#progress-played").width(0);
			$("#progress-download").width(0);
			$("#playing-title").empty();
			$("#playing-artist").empty();
			$("#playing-album").empty();
			$('.playing').removeClass('playing');
			$('#playing').hide();
			document.title = 'wissl';
		}
	};

	player.previous = function () {
		if (player.playing) {
			player.sound.destruct();
			if (player.nextSound !== null) {
				player.nextSound.destruct();
				player.nextSound = null;
				player.nextPlaying = null;
			}

			var p = player.playing;
			$.ajax({
				url : "wissl/playlist/" + p.playlist_id + "/song/" + (p.position - 1),
				headers : {
					"sessionId" : wsl.sessionId
				},
				dataType : "json",
				success : function (data) {
					if (data.song && data.song.id) {
						player.internalPlay({
							song_id : data.song.id,
							playlist_id : p.playlist_id,
							playlist_name : p.playlist_name,
							position : p.position - 1
						});
					} else {
						player.stop();
					}
				},
				error : function (xhr) {
					if (xhr.status === 404) {
						player.stop();
					} else {
						wsl.ajaxError("Failed to get previous song in playlist", xhr);
					}
				}
			});
		}
	};

	player.next = function () {

		if (player.playing) {
			if (player.nextSound !== null && player.nextPlaying !== null) {
				player.internalPlay(player.nextPlaying);
				player.nextPlaying = null;
				return;
			}

			player.sound.destruct();
			var p = player.playing;
			$.ajax({
				url : "wissl/playlist/" + p.playlist_id + "/song/" + (p.position + 1),
				headers : {
					"sessionId" : wsl.sessionId
				},
				dataType : "json",
				success : function (data) {
					if (data.song && data.song.id) {
						player.internalPlay({
							song_id : data.song.id,
							playlist_id : p.playlist_id,
							playlist_name : p.playlist_name,
							position : p.position + 1
						});
					} else {
						player.stop();
					}
				},
				error : function (xhr) {
					if (xhr.status === 404) {
						player.stop();
					} else {
						wsl.ajaxError("Failed to get next song in playlist", xhr);
					}
				}
			});
		}
	};

	player.toggleMute = function () {
		player.mute = !player.mute;
	};

	player.showVolume = function () {
		$('#volume-container').show();
	};

	player.hideVolume = function () {
		$('#volume-container').hide();
	};

	player.adjustVolume = function (event) {
		var y, h, vol, vs, scroll;
		vs = $("#volume-slider");
		h = vs.height();
		scroll = Math.max($('body').scrollTop(), $('html').scrollTop());
		y = h - event.clientY + vs.offset().top - scroll;

		vol = (y / h) * 100;
		vol = Math.min(100, vol);
		vol = Math.max(0, vol);
		player.volume = vol;
	};

}(player));

player.init(false);
