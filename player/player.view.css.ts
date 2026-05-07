namespace $.$$ {
	$mol_style_define($bog_vk_player, {
		width: '100%',
		flex: {
			direction: 'column',
			shrink: 0,
		},
		background: {
			color: $mol_theme.card,
		},
		position: 'sticky',
		bottom: 0,

		Progress_row: {
			flex: {
				direction: 'row',
				shrink: 0,
			},
			align: {
				items: 'center',
			},
			padding: {
				top: '0.25rem',
				bottom: '0.25rem',
				left: '0.75rem',
				right: '0.75rem',
			},
			gap: $mol_gap.text,
		},

		Progress: {
			height: '3px',
			background: {
				color: $mol_theme.line,
			},
			cursor: 'pointer',
			flex: {
				grow: 1,
				shrink: 1,
			},
		},

		Progress_bar: {
			height: '3px',
			background: {
				color: $mol_theme.focus,
			},
			width: 0,
		},

		Time_current: {
			font: { size: '0.75rem' },
			color: $mol_theme.shade,
			whiteSpace: 'nowrap',
			flex: { shrink: 0 },
		},

		Time_total: {
			font: { size: '0.75rem' },
			color: $mol_theme.shade,
			whiteSpace: 'nowrap',
			flex: { shrink: 0 },
		},

		Controls: {
			flex: {
				direction: 'row',
			},
			align: {
				items: 'center',
			},
			padding: {
				top: '0.25rem',
				bottom: '0.25rem',
				left: '0.75rem',
				right: '0.75rem',
			},
			gap: $mol_gap.text,
		},

		Left: {
			flex: {
				direction: 'row',
				grow: 1,
				shrink: 1,
			},
			align: {
				items: 'center',
			},
			gap: $mol_gap.text,
			overflow: {
				x: 'hidden',
			},
		},

		Cover: {
			width: '2.5rem',
			height: '2.5rem',
			borderRadius: '4px',
			flex: {
				shrink: 0,
			},
			objectFit: 'cover',
		},

		Cover_placeholder: {
			width: '2.5rem',
			height: '2.5rem',
			borderRadius: '4px',
			flex: {
				shrink: 0,
			},
			background: {
				color: $mol_theme.line,
			},
			color: $mol_theme.shade,
			justify: {
				content: 'center',
			},
			align: {
				items: 'center',
			},
		},

		Track_info: {
			flex: {
				direction: 'column',
				shrink: 1,
			},
			overflow: {
				x: 'hidden',
			},
			gap: '0.125rem',
		},

		Title: {
			font: {
				weight: 'bold',
				size: '0.8125rem',
			},
			whiteSpace: 'nowrap',
			overflow: {
				x: 'hidden',
			},
			textOverflow: 'ellipsis',
		},

		Artist: {
			font: {
				size: '0.75rem',
			},
			color: $mol_theme.shade,
			whiteSpace: 'nowrap',
			overflow: {
				x: 'hidden',
			},
			textOverflow: 'ellipsis',
		},

		Center: {
			flex: {
				direction: 'row',
				shrink: 0,
			},
			align: {
				items: 'center',
			},
			gap: '0.25rem',
		},

		Volume_panel: {
			padding: {
				top: '0.75rem',
				bottom: '0.75rem',
				left: '0.5rem',
				right: '0.5rem',
			},
			align: {
				items: 'center',
			},
		},

		Volume_slider: {
			width: '6px',
			height: '8rem',
			background: { color: $mol_theme.line },
			borderRadius: '3px',
			cursor: 'pointer',
			position: 'relative',
			overflow: { x: 'hidden', y: 'hidden' },
			touchAction: 'none',
			userSelect: 'none',
		},

		Volume_fill: {
			position: 'absolute',
			left: 0,
			right: 0,
			bottom: 0,
			background: { color: $mol_theme.focus },
			borderRadius: '3px',
		},

	})
}
